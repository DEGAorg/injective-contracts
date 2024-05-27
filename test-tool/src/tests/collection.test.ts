import { MsgExecuteContractCompat } from "@injectivelabs/sdk-ts";
import { compareWasmError, createBasicTx, createExecuteMintMessage } from "../helpers/wasm";
import { AppContext, getAppContext } from "../context";
import { DegaCw721ExecuteMsg, DegaMinterExecuteMsg } from "../messages";
import { TestContext, getTestContext } from "./testContext";
import { logObjectFullDepth } from "./setup";
import { MintRequest } from "../messages/dega_minter_execute";

const mintToken = async (appContext: AppContext, recipient: string) => {
  const [mintRequestMsg, signature] = await createBasicTx(appContext, recipient, 0.000001);
  const execMsg = createExecuteMintMessage(appContext, mintRequestMsg, signature, appContext.primaryAddress);
  const response = await appContext.primaryBroadcaster.broadcast({
    msgs: execMsg,
    gas: appContext.gasSettings,
  });
  if (!response.logs || response.logs.length === 0) {
    logObjectFullDepth(response);
    throw new Error(`Failed to mint token`);
  }
  const tokenId = response.logs[0].events.filter((x:any) => x.type === "wasm").map((x:any) => x.attributes.find((y:any) => y.key === "token_id")?.value)[0];
  return tokenId;
}

const ERROR_MESSAGES = {
  notExisting: `( Error in DEGA CW721: ( Error during base execution ) | Caused by Base721`,
  notOwner: `( Error in DEGA CW721: ( Error during base execution ) | Caused by Base721 Error: ( Caller is not the contract's current owner ) ): execute wasm contract failed`
};

jest.setTimeout(30000);

describe('Dega Collection', () => {
  let appContext: AppContext;
  let testContext: TestContext;
  let tokenId: string;
  beforeAll(async () => {
    appContext = await getAppContext();
    testContext = await getTestContext();
    tokenId = await mintToken(appContext, testContext.testAddressOne);
  });

  it(`Should fail to send non existing tokenId`, async () => {
    const contractMsg: DegaCw721ExecuteMsg = {
      transfer_nft: {
        recipient: testContext.testAddressTwo,
        token_id: '1000',
      }
    }
    const execMsg = MsgExecuteContractCompat.fromJSON({
      sender: testContext.testAddressTwo,
      contractAddress: appContext.cw721Address,
      msg: contractMsg,
      funds: []
    })

    let wasmErrorComparison = false;
    // catch the error
    try {
      const response = await testContext.twoBroadcaster.broadcast({
        msgs: execMsg,
        gas: appContext.gasSettings,
      })
    } catch (error: any) {
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.notExisting, error);
    }
    expect(wasmErrorComparison).toBe(true);
  }, 15000);

  it(`Should fail to send token if not owner`, async () => {
    // transfer token
    const contractMsg: DegaCw721ExecuteMsg = {
      transfer_nft: {
        recipient: testContext.testAddressThree,
        token_id: tokenId,
      }
    }
    const execMsg = MsgExecuteContractCompat.fromJSON({
      sender: testContext.testAddressTwo,
      contractAddress: appContext.cw721Address,
      msg: contractMsg,
      funds: []
    })

    let wasmErrorComparison = false;
    // catch the error
    try {
      const response = await testContext.twoBroadcaster.broadcast({
        msgs: execMsg,
        gas: appContext.gasSettings,
      })
    } catch (error: any) {
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.notOwner, error);
    }
    expect(wasmErrorComparison).toBe(true);
  });

  it(`Should fail to burn token if not owner`, async () => {
    // burn token
    const contractMsg: DegaCw721ExecuteMsg = {
      burn: {
        token_id: tokenId,
      }
    }
    const execMsg = MsgExecuteContractCompat.fromJSON({
      sender: testContext.testAddressTwo,
      contractAddress: appContext.cw721Address,
      msg: contractMsg,
      funds: []
    })

    let wasmErrorComparison = false;
    // catch the error
    try {
      const response = await testContext.twoBroadcaster.broadcast({
        msgs: execMsg,
        gas: appContext.gasSettings,
      })
    } catch (error: any) {
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.notOwner, error);
    }
    expect(wasmErrorComparison).toBe(true);
  });

  it(`Should successfully transfer token`, async () => {
    // transfer token
    const contractMsg: DegaCw721ExecuteMsg = {
      transfer_nft: {
        recipient: testContext.testAddressThree,
        token_id: tokenId,
      }
    }
    const execMsg = MsgExecuteContractCompat.fromJSON({
      sender: testContext.testAddressOne,
      contractAddress: appContext.cw721Address,
      msg: contractMsg,
      funds: []
    })

    const response = await testContext.oneBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
  });

  it(`Should successfully burn token`, async () => {
    // burn token
    const contractMsg: DegaCw721ExecuteMsg = {
      burn: {
        token_id: tokenId,
      }
    }
    const execMsg = MsgExecuteContractCompat.fromJSON({
      sender: testContext.testAddressThree,
      contractAddress: appContext.cw721Address,
      msg: contractMsg,
      funds: []
    })

    const response = await testContext.threeBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
  });

});