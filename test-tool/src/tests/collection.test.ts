import { MsgExecuteContractCompat } from "@injectivelabs/sdk-ts";
import { compareWasmError, createBasicTx, createExecuteMintMessage } from "../helpers/minter";
import { AppContext, getAppContext } from "../context";
import { DegaCw721ExecuteMsg, DegaMinterExecuteMsg } from "../messages";
import { TestContext, getTestContext } from "./testContext";
import { logObjectFullDepth } from "./setup";
import { MintRequest } from "../messages/dega_minter_execute";
import { createApproveAllToken, createApproveToken, createBurnNft, createRevokeAlltoken, createRevokeToken, createTransferNft } from "../helpers/collection";

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
  const tokenId = response.logs[0].events.filter((x: any) => x.type === "wasm").map((x: any) => x.attributes.find((y: any) => y.key === "token_id")?.value)[0];
  return tokenId;
}

const ERROR_MESSAGES = {
  notExisting: `( DEGA Collection CW721 Error: ( Unable to execute CW721. ) | Caused by CW721`,
  notOwner: `( DEGA Collection CW721 Error: ( Unable to execute CW721. ) | Caused by CW721 Error: ( Caller is not the contract's current owner ) ): execute wasm contract failed`
};

jest.setTimeout(30000);

describe.skip('Dega Collection', () => {
  let appContext: AppContext;
  let testContext: TestContext;
  let negativeTestTokenId: string;
  beforeAll(async () => {
    appContext = await getAppContext();
    testContext = await getTestContext();
    negativeTestTokenId = await mintToken(appContext, testContext.testAddressOne);
  });

  it(`Should fail to send non existing tokenId`, async () => {
    const execMsg = createTransferNft(appContext, testContext.testAddressTwo, '1000', testContext.testAddressTwo);

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
    const execMsg = createTransferNft(appContext, testContext.testAddressThree, negativeTestTokenId, testContext.testAddressTwo);

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
    const execMsg = createBurnNft(appContext, negativeTestTokenId, testContext.testAddressTwo);

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
    const execMsg = createTransferNft(appContext, testContext.testAddressThree, negativeTestTokenId, testContext.testAddressOne);

    const response = await testContext.oneBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
  });

  it(`Should successfully burn token`, async () => {
    // burn token
    const execMsg = createBurnNft(appContext, negativeTestTokenId, testContext.testAddressThree);

    const response = await testContext.threeBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
  });

  it(`Should success to aprove token to another address`, async () => {
    // mint token
    const tokenId = await mintToken(appContext, testContext.testAddressOne);
    // approve token
    const execMsg = createApproveToken(appContext, tokenId, testContext.testAddressTwo, testContext.testAddressOne);

    const response = await testContext.oneBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
  });

  it(`Should success to revoke token to another address`, async () => {
    // mint token
    const tokenId = await mintToken(appContext, testContext.testAddressOne);
    // approve token
    const mintExecMsg = createApproveToken(appContext, tokenId, testContext.testAddressTwo, testContext.testAddressOne);
    const mintResponse = await testContext.oneBroadcaster.broadcast({
      msgs: mintExecMsg,
      gas: appContext.gasSettings,
    });
    expect(mintResponse.code).toBe(0);

    // revoke token
    const execMsg = createRevokeToken(appContext, tokenId, testContext.testAddressTwo, testContext.testAddressOne);

    const response = await testContext.oneBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
  })

  it(`Should success to aprove all token to another address`, async () => {
    // approve token
    const execMsg = createApproveAllToken(appContext, testContext.testAddressTwo, testContext.testAddressOne);

    const response = await testContext.oneBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
  })

  it(`Should success to revoke all token to another address`, async () => {
    // approve token
    const approveAll = createApproveAllToken(appContext, testContext.testAddressTwo, testContext.testAddressOne);
    const approveResponse = await testContext.oneBroadcaster.broadcast({
      msgs: approveAll,
      gas: appContext.gasSettings,
    });
    expect(approveResponse.code).toBe(0);

    // revoke token
    const revokeAll = createRevokeAlltoken(appContext, testContext.testAddressTwo, testContext.testAddressOne);

    const response = await testContext.oneBroadcaster.broadcast({
      msgs: revokeAll,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
  })

  it(`Should success to transfer a token from an approved address`, async () => {
    // mint token
    const tokenId = await mintToken(appContext, testContext.testAddressOne);
    // approve token
    const execMsg = createApproveToken(appContext, tokenId, testContext.testAddressTwo, testContext.testAddressOne);

    const response = await testContext.oneBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);

    // transfer token
    const transferExecMsg = createTransferNft(appContext, testContext.testAddressThree, tokenId, testContext.testAddressTwo);

    const transferResponse = await testContext.twoBroadcaster.broadcast({
      msgs: transferExecMsg,
      gas: appContext.gasSettings,
    })
    expect(transferResponse.code).toBe(0);
  })

});