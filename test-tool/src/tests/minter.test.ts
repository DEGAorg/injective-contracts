import { DegaMinterExecuteMsg, DegaMinterInstantiateMsg, DegaMinterQueryMsg } from "../messages";
import { Config } from "../config";
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

const createSignature = (mintRequestMsg: MintRequest, appContext: AppContext): [Buffer, Buffer] => {
  let rawMessage = Buffer.from(toBase64(mintRequestMsg), "base64")
  let msgMd5Hash = Buffer.from(sha256(rawMessage))
  let signature = Buffer.from(secp256k1.ecdsaSign(msgMd5Hash, appContext.signerSigningKey).signature)
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

const createExecuteMintMessage = (appContext: AppContext, mintRequestMsg: MintRequest, signature: Buffer): MsgExecuteContractCompat => {
  const mintMsg: DegaMinterExecuteMsg = {
    mint: {
      request: mintRequestMsg,
      signature: signature.toString("base64")
    }
  };
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: appContext.primaryAddress,
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

const createBasicTx = (appContext: AppContext, testContext: TestContext, price: number = 0.5): [MintRequest, Buffer] => {
  // Create Mint Request And Signature
  let nft_price_wei = getNFTWeiPrice(price)
  let mintRequestMsg = createMintRequest(testContext, appContext, nft_price_wei);
  const [msgMd5Hash, signature] = createSignature(mintRequestMsg, appContext);
  console.log("PubKey Compressed: " + appContext.signerCompressedPublicKey.toString("base64"));

  // Check Signature
  let checkSigQuery: DegaMinterQueryMsg = createCheckSigQuery(mintRequestMsg, signature, appContext);
  const checkSigQueryResponseObject: object = exeCheckSigQuery(appContext, checkSigQuery);

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
}

jest.setTimeout(30000);
// configure jest to run a single test at a time, not parallel


// Fuzz.test(`Example of a Fuzz Test`, Fuzz.float({min: 0.001, max: 100}), async (nftPrice: number) => {
//     console.log(`NFT Price: ${nftPrice}`);
//     expect(nftPrice).toBeGreaterThanOrEqual(0.001);
//     expect(nftPrice).toBeLessThanOrEqual(100);
// });
describe('Dega Minter: ', () => {
  let appContext: AppContext;
  let testContext: TestContext;
  beforeAll(async () => {
    appContext = await getAppContext();
    testContext = await getTestContext();
  });

  it('should mint an NFT successfully with price from 0.001 to 100', async () => {
    const numOfTests = 10;
    const fuzzFunc = Fuzz.float({ min: 0.001, max: 10 });
    for (let i = 0; i < numOfTests; i++) {
      const fuzzedPrice = fuzzFunc();
      console.warn(`=====Fuzzed Price: ${fuzzedPrice}`);
      // Basic tx
      const [mintRequestMsg, signature] = createBasicTx(appContext, testContext, fuzzedPrice);

      // Execute Mint
      const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature);

      await info([]);

      console.log(`Minter Address: `, appContext.minterAddress);

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
});
describe.skip('Dega Minter', () => {
  it(`should mint an NFT successfully`, async () => {
    const numOfTests = 2; // or 250
    const fuzzFunc = Fuzz.float({ min: 0.001, max: 0.5 });
    for (let i = 0; i < numOfTests; i++) {
      const appContext = await getAppContext();
      const testContext = await getTestContext();

      const fuzzedPrice = fuzzFunc();
      // Basic tx
      const [mintRequestMsg, signature] = createBasicTx(appContext, testContext, fuzzedPrice);

      // Execute Mint
      const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature);

      await info([]);

      console.log(`Minter Address: `, appContext.minterAddress);

      const response = await appContext.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: appContext.gasSettings,
      });

      // await for blockchain
      // add a sleep function? play with the amount of time
      await sleep(1000);

      expect(response.code).toEqual(0);
    }
    //     Fuzz.it('should mint an NFT successfully', Fuzz.float({min: 0.001, max: 100}), async () => {
    //         const appContext = await getAppContext();
    //         const testContext = await getTestContext();

    //         // Basic tx
    //         const [mintRequestMsg, signature] = createBasicTx(appContext, testContext);

    //         // Execute Mint
    //         const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature);

    //         await info([]);

    //         console.log(`Minter Address: `, appContext.minterAddress);

    //         const response = await appContext.primaryBroadcaster.broadcast({
    //             msgs: execMsg,
    //             gas: appContext.gasSettings,
    //         });

    //         // await for blockchain
    //         // add a sleep function? play with the amount of time
    //         sleep(10000);

    //         expect(response.code).toEqual(0);
    //     });
  }, 300000);

  // create a test with a bad signature
  it.skip('should fail to mint an NFT with a bad signature', async () => {
    const appContext = await getAppContext();
    const testContext = await getTestContext();

    // Basic tx
    const [mintRequestMsg, signature] = createBasicTx(appContext, testContext);

    // Alter the signature
    signature[0] = 0;

    // Execute Mint
    const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature);

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
  it.skip('should fail to mint an NFT with a bad price', async () => {
    const appContext = await getAppContext();
    const testContext = await getTestContext();

    // Basic tx
    const [mintRequestMsg, signature] = createBasicTx(appContext, testContext);

    // Alter the price
    mintRequestMsg.price = "0";

    // Execute Mint
    const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature);

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
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.invalidPrice, error);
    }
    expect(wasmErrorComparison).toEqual(true);
  });
});