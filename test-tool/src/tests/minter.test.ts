import { DegaMinterExecuteMsg } from "../messages";
import { MsgExecuteContractCompat} from "@injectivelabs/sdk-ts";
import { AppContext, getAppContext } from "../context";
import { TestContext, getTestContext } from "./testContext";
import { info } from "../query";
import { compareWasmError, createBasicTx, createExecuteMintMessage, sanitizedMaxNumber, sleep } from "../helpers/minter";
import Fuzz from "jest-fuzz";
import * as dotenv from "dotenv";
dotenv.config();

// Imports envs
const MINT_RUNS = process.env.MINT_RUNS || 10;
const MINT_MAX_PRICE = process.env.MINT_MAX_PRICE || 0.005;
const TWO_MINT_RUNS = process.env.TWO_MINT_RUNS || 2;

// Invalid Price is the same as signature since the validation of the message will not pass
const ERROR_MESSAGES = {
  invalidSignature: `( DEGA Minter Error: ( Signature is invalid ) ): execute wasm contract failed`,
  invalidPrice: `( DEGA Minter Error: ( Signature is invalid ) ): execute wasm contract failed`,
  paused: `( DEGA Minter Error: ( Minting not allowed while minting is paused. ) ): execute wasm contract failed`,
}

jest.setTimeout(30000);

describe('Dega Minter with Fuzz: ', () => {
  let appContext: AppContext;
  let testContext: TestContext;
  beforeAll(async () => {
    appContext = await getAppContext();
    testContext = await getTestContext();
  });

  const mintRuns = Number(MINT_RUNS);
  const mintMaxPrice = Number(MINT_MAX_PRICE);
  const twoMintRuns = Number(TWO_MINT_RUNS);

  it(`Auxiliary sanity check works as intended`, async () => {
    // Keep Max Price
    const maxPrice = 100;
    const price = 200;
    const sanitizedPrice = sanitizedMaxNumber(price, maxPrice);
    expect(sanitizedPrice).toEqual(maxPrice);
    // Lower Price
    const price2 = 0.001;
    const sanitizedPrice2 = sanitizedMaxNumber(price2, maxPrice);
    expect(sanitizedPrice2).toEqual(price2);
  });

  it(`should mint an NFT successfully with price from 0.001 to ${mintMaxPrice} for ${mintRuns} runs`, async () => {
    const fuzzFunc = Fuzz.float({ min: 0.001, max: mintMaxPrice });
    for (let i = 0; i < mintRuns; i++) {
      const fuzzedPrice = fuzzFunc();
      const sanitizedPrice = sanitizedMaxNumber(fuzzedPrice, mintMaxPrice);
      // console.warn(`=====Fuzzed Price: ${fuzzedPrice}`);
      // Basic tx
      const [mintRequestMsg, signature] = await createBasicTx(appContext, testContext.testAddressOne, sanitizedPrice);

      // Execute Mint
      const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature, appContext.primaryAddress);

      try{

        const response = await appContext.primaryBroadcaster.broadcast({
          msgs: execMsg,
          gas: appContext.gasSettings,
        });
        // await for blockchain
        // add a sleep function? play with the amount of time
        await sleep(500);
  
        expect(response.code).toEqual(0);
      } catch (error: any) {
        console.log(`Mint req price: ${mintRequestMsg.price}`);
        console.log(`Sanitized Price: ${sanitizedPrice}`);
        console.log(`ExecMsg price: ${(execMsg as any).funds}`);
        throw error;
      }
    }
  }, 600000);

  // create a test to mint multiple NFTs with twoBroadcaster
  it(`should mint multiple NFTs with two broadcasters for ${twoMintRuns} runs`, async () => {
    const maxPrice = 0.5;
    const fuzzFunc = Fuzz.float({ min: 0.001, max: maxPrice });
    for (let i = 0; i < twoMintRuns; i++) {
      const fuzzedPrice = fuzzFunc();
      const sanitizedPrice = sanitizedMaxNumber(fuzzedPrice, maxPrice);
      // Basic tx
      const [mintRequestMsg, signature] = await createBasicTx(appContext, testContext.testAddressTwo, sanitizedPrice);

      // Execute Mint
      const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature, testContext.testAddressTwo);

      const response = await testContext.twoBroadcaster.broadcast({
        msgs: execMsg,
        gas: appContext.gasSettings,
      });

      // await for blockchain
      // add a sleep function? play with the amount of time
      await sleep(500);

      expect(response.code).toEqual(0);
    }
  }, 250000);
});

describe('Dega Minter Negative confirmations', () => {
  let appContext: AppContext;
  let testContext: TestContext;
  beforeAll(async () => {
    appContext = await getAppContext();
    testContext = await getTestContext();
  });

  // create a test with a bad signature
  it('should fail to mint an NFT with a bad signature', async () => {

    // Basic tx
    const [mintRequestMsg, signature] = await createBasicTx(appContext, testContext.testAddressOne);

    // Alter the signature
    signature[0] = 0;

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

  // create a test with a executed mint request with a bad price
  it('should fail to mint an NFT with a bad price', async () => {

    // Basic tx
    const [mintRequestMsg, signature] = await await createBasicTx(appContext, testContext.testAddressOne);

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
    // Basic tx
    const [mintRequestMsg, signature] = await createBasicTx(appContext, testContext.testAddressOne, 0.5, true);

    // Execute Mint
    const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature, testContext.testAddressTwo);

    let wasmErrorComparison = false;
    // catch the error
    try {
      const response = await testContext.twoBroadcaster.broadcast({
        msgs: execMsg,
        gas: appContext.gasSettings,
      })
    } catch (error: any) {
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.invalidSignature, error);
    }
    expect(wasmErrorComparison).toEqual(true);
  });

  it(`should fail to mint an NFT with a paused contract`, async () => {

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
    const [mintRequestMsg, signature] = await createBasicTx(appContext, testContext.testAddressOne);

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
    // unpause the contract
    const unpauseMsg: DegaMinterExecuteMsg = {
      update_settings: {
        settings: {
          minting_paused: false,
          signer_pub_key: appContext.signerCompressedPublicKey.toString("base64")
        }
      }
    };
    const unpauseExecMsg = MsgExecuteContractCompat.fromJSON({
      sender: appContext.primaryAddress,
      contractAddress: appContext.minterAddress,
      msg: unpauseMsg,
      funds: []
    });
    const unpauseResponse = await appContext.primaryBroadcaster.broadcast({
      msgs: unpauseExecMsg,
      gas: appContext.gasSettings,
    });
    expect(unpauseResponse.code).toEqual(0);
  });
});