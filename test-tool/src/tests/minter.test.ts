import { DegaMinterExecuteMsg, DegaMinterInstantiateMsg, DegaMinterQueryMsg } from "../messages";
import { Config, generatePrivateKey } from "../config";
import { fromBase64, MsgExecuteContractCompat, MsgInstantiateContract, sha256, toBase64 } from "@injectivelabs/sdk-ts";
import { stripQuotes, TxAttribute, TxEvent } from "../tx";
import { BigNumberInBase, BigNumberInWei } from "@injectivelabs/utils";
import { MintRequest } from "../messages/dega_minter_execute";
import { v4 as uuidv4 } from "uuid";
import secp256k1 from "secp256k1";
import { SignerSourceTypeEnum } from "../messages/dega_minter_query";
import { AppContext, getAppContext } from "../context";
import { TestContext, getTestContext } from "./testContext";
import { info } from "../query";
import { logObjectFullDepth } from "./setup";
import { compareWasmError } from "../helpers/wasm";
import Fuzz from "jest-fuzz";

const getNFTWeiPrice = (nftPrice: number): string => {
  return new BigNumberInBase(nftPrice).toWei().toFixed();
};

const getNowInSeconds = (): number => {
  return Math.floor(Date.now() / 1000);
};

const getValidTimes = (): [number, number] => {
  const nowInSeconds = getNowInSeconds();
  const startTimeInSeconds: number = nowInSeconds - 5; // 5 seconds ago
  const endTimeInSeconds: number = nowInSeconds + 60 * 5; // 5 minutes from now
  return [startTimeInSeconds, endTimeInSeconds];
}

const createMintRequest = (context: TestContext, appContext: AppContext, price: string): MintRequest => {
  const [startTimeInSeconds, endTimeInSeconds] = getValidTimes();
  return {
    to: context.testAddressOne,
    primary_sale_recipient: context.testAddressTwo,
    uri: "https://example.com",
    price: price,
    currency: "inj",
    validity_start_timestamp: startTimeInSeconds.toString(),
    validity_end_timestamp: endTimeInSeconds.toString(),
    uuid: uuidv4(),
    collection: appContext.cw721Address,
  };
}

const createSignature = (mintRequestMsg: MintRequest, appContext: AppContext, unAuthorized: boolean = false): [Buffer, Buffer] => {
  let rawMessage = Buffer.from(toBase64(mintRequestMsg), "base64")
  let msgMd5Hash = Buffer.from(sha256(rawMessage))
  let signature: Buffer;
  if (unAuthorized) {
    const signerPrivateKey = generatePrivateKey();
    const signerSigningKey = Buffer.from(signerPrivateKey.toPrivateKeyHex().slice(2), "hex");
    signature = Buffer.from(secp256k1.ecdsaSign(msgMd5Hash, signerSigningKey).signature);
  }
  signature = Buffer.from(secp256k1.ecdsaSign(msgMd5Hash, appContext.signerSigningKey).signature)
  return [msgMd5Hash, signature];
};

const createCheckSigQuery = (mintRequestMsg: MintRequest, signature: Buffer, appContext: AppContext): DegaMinterQueryMsg => {
  return {
    check_sig: {
      message: {
        mint_request: mintRequestMsg
      },
      signature: signature.toString("base64"),
      signer_source: SignerSourceTypeEnum.ConfigSignerPubKey
    }
  };
}

const exeCheckSigQuery = async (appContext: AppContext, checkSigQuery: DegaMinterQueryMsg): Promise<object> => {
  const checkSigQueryResponse = await appContext.queryWasmApi.fetchSmartContractState(appContext.minterAddress, toBase64(checkSigQuery));
  return fromBase64(Buffer.from(checkSigQueryResponse.data).toString("base64"));
}

const createExecuteMintMessage = (appContext: AppContext, mintRequestMsg: MintRequest, signature: Buffer, sender: string): MsgExecuteContractCompat => {
  const mintMsg: DegaMinterExecuteMsg = {
    mint: {
      request: mintRequestMsg,
      signature: signature.toString("base64")
    }
  };
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: sender,
    contractAddress: appContext.minterAddress,
    msg: mintMsg,
    funds: [
      {
        denom: "inj",
        amount: mintRequestMsg.price
      }
    ],
  });
  return execMsg;
}

const createBasicTx = async (appContext: AppContext, testContext: TestContext, price: number = 0.5, unAuthorized:boolean = false): Promise<[MintRequest, Buffer]> => {
  // Create Mint Request And Signature
  let nft_price_wei = getNFTWeiPrice(price)
  console.warn(`=====NFT Price: ${nft_price_wei}`);
  let mintRequestMsg = createMintRequest(testContext, appContext, nft_price_wei);
  const [msgMd5Hash, signature] = createSignature(mintRequestMsg, appContext, unAuthorized);
  console.log("PubKey Compressed: " + appContext.signerCompressedPublicKey.toString("base64"));

  // Check Signature
  let checkSigQuery: DegaMinterQueryMsg = createCheckSigQuery(mintRequestMsg, signature, appContext);
  const checkSigQueryResponseObject: object = await exeCheckSigQuery(appContext, checkSigQuery);

  console.log(checkSigQueryResponseObject);
  console.log();
  console.log("Test Query Locally Calculated Message Hash: " + msgMd5Hash.toString("hex"));
  return [mintRequestMsg, signature];
}

const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Invalid Price is the same as signature since the validation of the message will not pass
const ERROR_MESSAGES = {
  invalidSignature: `( Error during execution of DEGA Minter: ( Signature is invalid ) ): execute wasm contract failed`,
  invalidPrice: `( Error during execution of DEGA Minter: ( Signature is invalid ) ): execute wasm contract failed`,
  paused: `( The requested operation is paused. ): execute wasm contract failed`,
}

const sanitizedMaxNumber = (num: number, max: number): number => {
  return num > max ? max : num;
};

jest.setTimeout(30000);

describe.skip('Dega Minter with Fuzz: ', () => {
  let appContext: AppContext;
  let testContext: TestContext;
  beforeAll(async () => {
    appContext = await getAppContext();
    testContext = await getTestContext();
  });

  const mintRuns = 10;
  const twoMintRuns = 2;

  it(`should mint an NFT successfully with price from 0.001 to 20 for ${mintRuns} runs`, async () => {
    const maxPrice = 0.005;
    const fuzzFunc = Fuzz.float({ min: 0.001, max: maxPrice });
    for (let i = 0; i < mintRuns; i++) {
      const fuzzedPrice = fuzzFunc();
      const sanitizedPrice = sanitizedMaxNumber(fuzzedPrice, maxPrice);
      console.warn(`=====Fuzzed Price: ${fuzzedPrice}`);
      // Basic tx
      const [mintRequestMsg, signature] = await createBasicTx(appContext, testContext, sanitizedPrice);

      // Execute Mint
      const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature, appContext.primaryAddress);

      const response = await appContext.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: appContext.gasSettings,
      });

      // await for blockchain
      // add a sleep function? play with the amount of time
      await sleep(1000);

      expect(response.code).toEqual(0);
    }
  }, 100000);

  // create a test to mint multiple NFTs with twoBroadcaster
  it(`should mint multiple NFTs with two broadcasters for ${twoMintRuns} runs`, async () => {
    const maxPrice = 0.005;
    const fuzzFunc = Fuzz.float({ min: 0.001, max: maxPrice });
    for (let i = 0; i < twoMintRuns; i++) {
      const fuzzedPrice = fuzzFunc();
      const sanitizedPrice = sanitizedMaxNumber(fuzzedPrice, maxPrice);

      console.warn(`=====Fuzzed Price: ${fuzzedPrice}`);
      // Basic tx
      const [mintRequestMsg, signature] = await createBasicTx(appContext, testContext, sanitizedPrice);

      // Execute Mint
      const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature, testContext.testAddressTwo);

      const response = await testContext.twoBroadcaster.broadcast({
        msgs: execMsg,
        gas: appContext.gasSettings,
      });

      // await for blockchain
      // add a sleep function? play with the amount of time
      await sleep(1000);

      expect(response.code).toEqual(0);
    }
  }, 100000);
});

describe.skip('Dega Minter Negative confirmations', () => {

  // create a test with a bad signature
  it('should fail to mint an NFT with a bad signature', async () => {
    const appContext = await getAppContext();
    const testContext = await getTestContext();

    // Basic tx
    const [mintRequestMsg, signature] = await createBasicTx(appContext, testContext);

    // Alter the signature
    signature[0] = 0;

    // Execute Mint
    const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature, appContext.primaryAddress);

    await info([]);

    console.log(`Minter Address: `, appContext.minterAddress);
    let wasmErrorComparison = false;
    // catch the error
    try {
      const response = await appContext.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: appContext.gasSettings,
      })
    } catch (error: any) {
      logObjectFullDepth(error)
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.invalidSignature, error);
    }
    expect(wasmErrorComparison).toEqual(true);
  });

  // create a test with a executed mint request with a bad price
  it('should fail to mint an NFT with a bad price', async () => {
    const appContext = await getAppContext();
    const testContext = await getTestContext();

    // Basic tx
    const [mintRequestMsg, signature] = await await createBasicTx(appContext, testContext);

    // Alter the price
    mintRequestMsg.price = "0";

    // Execute Mint
    const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature, appContext.primaryAddress);

    await info([]);

    console.log(`Minter Address: `, appContext.minterAddress);

    let wasmErrorComparison = false;
    // catch the error
    try {
      const response = await appContext.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: appContext.gasSettings,
      })
    } catch (error: any) {
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.invalidPrice, error);
    }
    expect(wasmErrorComparison).toEqual(true);
  });

  it(`should fail to mint an NFT with a signature from an unauthorized signer`, async () => {
    const appContext = await getAppContext();
    const testContext = await getTestContext();
    // Basic tx
    const [mintRequestMsg, signature] = await createBasicTx(appContext, testContext, 0.5, true);

    // Execute Mint
    const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature, appContext.primaryAddress);

    let wasmErrorComparison = false;
    // catch the error
    try {
      const response = await appContext.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: appContext.gasSettings,
      })
    } catch (error: any) {
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.invalidSignature, error);
    }
    expect(wasmErrorComparison).toEqual(true);
  });

  it(`should fail to mint an NFT with a paused contract`, async () => {
    const appContext = await getAppContext();
    const testContext = await getTestContext();

    // Pause the contract
    const pauseMsg: DegaMinterExecuteMsg = {
      update_settings: {
        settings: {
          minting_paused: true,
          signer_pub_key: appContext.signerCompressedPublicKey.toString("base64")
        }
      }
    };
    const pauseExecMsg = MsgExecuteContractCompat.fromJSON({
      sender: appContext.primaryAddress,
      contractAddress: appContext.minterAddress,
      msg: pauseMsg,
      funds: []
    });

    const pauseResponse = await appContext.primaryBroadcaster.broadcast({
      msgs: pauseExecMsg,
      gas: appContext.gasSettings,
    });

    expect(pauseResponse.code).toEqual(0);

    // Basic tx
    const [mintRequestMsg, signature] = await createBasicTx(appContext, testContext);

    // Execute Mint
    const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature, appContext.primaryAddress);

    let wasmErrorComparison = false;
    // catch the error
    try {
      const response = await appContext.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: appContext.gasSettings,
      })
    } catch (error: any) {
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.paused, error);
    }
    expect(wasmErrorComparison).toEqual(true);
  });
});