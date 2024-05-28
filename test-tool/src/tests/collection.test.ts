import { MsgExecuteContractCompat } from "@injectivelabs/sdk-ts";
import { compareWasmError, createBasicTx, createExecuteMintMessage } from "../helpers/minter";
import { AppContext, getAppContext } from "../context";
import { DegaCw721ExecuteMsg, DegaMinterExecuteMsg } from "../messages";
import { TestContext, getTestContext } from "./testContext";
import { logObjectFullDepth } from "./setup";
import { MintRequest } from "../messages/dega_minter_execute";
import { createAllNftInfoQuery, createAllTokensQuery, createApprovalQuery, createApprovalsQuery, createApproveAllToken, createApproveToken, createBurnNft, createCollectionInfoQuery, createContractInfoQuery, createExtensionQuery, createMintMsg, createMinterQuery, createNftInfoQuery, createNumTokensQuery, createOwnerOfQuery, createOwnershipQuery, createRevokeAlltoken, createRevokeToken, createSendNft, createTokensQuery, createTransferNft, createUpdateCollectionInfo, generalCollectionGetter } from "../helpers/collection";
import { info } from "../query";
import { Cw2981QueryMsg } from "../messages/dega_cw721_query";

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
  notExisting: `( DEGA Collection CW721 Error: ( Unable to execute CW721 TransferNft ) | Caused by CW721`,
  transfer: `( DEGA Collection CW721 Error: ( Unable to execute CW721 TransferNft: User does not have permission for this token ) | Caused by CW721 Error: ( Caller is not the contract's current owner ) ): execute wasm contract failed`,
  burn: `( DEGA Collection CW721 Error: ( Unable to execute CW721 Burn: User does not have permission for this token ) | Caused by CW721 Error: ( Caller is not the contract's current owner ) ): execute wasm contract failed`,
  onlyMinter: `( DEGA Collection Unauthorized Error: ( Generic error: Action only available to minter ) ): execute wasm contract failed`,
  sendToNonContract: `dispatch: submessages: contract: not found`,
  updateCollectionInfo : `( DEGA Collection Unauthorized Error: ( Only minter admins can update collection info ) ): execute wasm contract failed`
};

const ERROR_QUERRIES = {
  notExisting: `type: cw721_base::state::TokenInfo`
}

jest.setTimeout(30000);

describe('Dega Collection', () => {
  let appContext: AppContext;
  let testContext: TestContext;
  let negativeTestTokenId: string;
  beforeAll(async () => {
    appContext = await getAppContext();
    testContext = await getTestContext();
    negativeTestTokenId = await mintToken(appContext, testContext.testAddressOne);
  });

  // standard non parameterized tests
  it(`Should success to read createNumTokensQuery`, async () => {
    const query = createNumTokensQuery();
    const response:any = await generalCollectionGetter(appContext, query);
    expect(response.count).toBe(1);
  });

  it(`Should success to read createContractInfoQuery`, async () => {
    const query = createContractInfoQuery();
    const response:any = await generalCollectionGetter(appContext, query);
    expect(response.symbol).toBe('TEST');
    expect(response.name).toBe('Test Collection');
  });

  it(`Should be able to read createNftInfoQuery of a token`, async () => {
    const query = createNftInfoQuery(negativeTestTokenId);
    const response:any = await generalCollectionGetter(appContext, query);
    expect(response.token_uri).toBe("https://example.com");
  });

  it(`Should success to read createAllNftInfoQuery`, async () => {
    const query = createAllNftInfoQuery(false, negativeTestTokenId);
    const response:any = await generalCollectionGetter(appContext, query);
    expect(response).toBeDefined();
    expect(response.access.owner).toBe(testContext.testAddressOne);
    expect(response.access.approvals.length).toBe(0);
    expect(response.info.token_uri).toBe("https://example.com");
  });

  it(`Should success to read createTokensQuery of the one test address`, async () => {
    const query = createTokensQuery(testContext.testAddressOne, "", 10)
    const response:any = await generalCollectionGetter(appContext, query);
    expect(response.tokens.length).toBe(1);
    expect(response.tokens[0]).toBe('1');
  });

  it(`Should success to read createAllTokensQuery of collection`, async () => {
    const query = createAllTokensQuery("", 10);
    const response:any = await generalCollectionGetter(appContext, query);
    expect(response.tokens.length).toBe(1);
  });

  it(`Should success to read createMinterQuery of collection`, async () => {
    const query = createMinterQuery();
    const response:any = await generalCollectionGetter(appContext, query);
    expect(response.minter).toBe(appContext.minterAddress);
  });

  it(`Should success to read createCollectionInfoQuery of collection`, async () => {
    const query =  createCollectionInfoQuery();
    const response:any = await generalCollectionGetter(appContext, query);
    expect(response).toBeDefined();
    expect(response.description).toBe("A simple test collection description");
  });

  it(`Should success to read createExtensionQuery of collection`, async () => {
    // check if royalties apply
    const query = createExtensionQuery();
    const response:any = await generalCollectionGetter(appContext, query);
    expect(response.royalty_payments).toBe(false); // royalty_payments
    // check royalty of negativeTestTokenId
    const queryRoyalty = createExtensionQuery(negativeTestTokenId);
    const responseRoyalty:any = await generalCollectionGetter(appContext, queryRoyalty);
    expect(responseRoyalty).toBeDefined(); // {address: , royalty_amount}
  });

  it(`Should success to read createOwnershipQuery of collection`, async () => {
    const query = createOwnershipQuery();
    const response:any = await generalCollectionGetter(appContext, query);
    expect(response.owner).toBe(appContext.minterAddress);
  });

  it(`Should fail to read non existing token`, async () => {
    const query = createOwnerOfQuery('1000', true);
    let wasmErrorComparison = false;
    try{
      const response = await generalCollectionGetter(appContext, query);
    } catch (error: any) {
      wasmErrorComparison = compareWasmError(ERROR_QUERRIES.notExisting, error);
    }
    expect(wasmErrorComparison).toBe(true);
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
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.transfer, error);
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
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.burn, error);
    }
    expect(wasmErrorComparison).toBe(true);
  });

  it(`Should successfully read the owner of a token`, async () => {
    const query = createOwnerOfQuery(negativeTestTokenId, true);
    const response:any = await generalCollectionGetter(appContext, query);
    expect(response).toBeDefined();
    expect(response.owner).toBe(testContext.testAddressOne);
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
    // check approval
    const query = createApprovalQuery(tokenId, testContext.testAddressTwo, false);
    const queryResponse: any = await generalCollectionGetter(appContext, query);
    expect(queryResponse.approval.spender).toBe(testContext.testAddressTwo);
    // check multiple approvals
    const queryMultiple =  createApprovalsQuery(tokenId, false);
    const queryMultipleResponse: any = await generalCollectionGetter(appContext, queryMultiple);
    expect(queryMultipleResponse.approvals.length).toBe(1);
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
    // check approval is gone
    const query = createAllNftInfoQuery(false, tokenId);
    const queryResponse: any = await generalCollectionGetter(appContext, query);
    expect(queryResponse.access.approvals.length).toBe(0);
  })

  it(`Should success to aprove all token to another address`, async () => {
    // approve token
    const execMsg = createApproveAllToken(appContext, testContext.testAddressTwo, testContext.testAddressOne);

    const response = await testContext.oneBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
    // 
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

  it(`Should fail to mint directly to the collection instead of the Minter`, async () => {
    // mint token
    const mintExecMsg = createMintMsg(appContext, testContext.testAddressOne, testContext.testAddressTwo);
    let wasmErrorComparison = false;
    try {
      const mintResponse = await testContext.twoBroadcaster.broadcast({
        msgs: mintExecMsg,
        gas: appContext.gasSettings,
      });
    } catch (error: any) {
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.onlyMinter, error);
    }
    expect(wasmErrorComparison).toBe(true);
  });

  it(`Should fail to send_nft to a non contract address`, async () => {
    const tokenId = await mintToken(appContext, testContext.testAddressOne);
    // create send nft
    const execMsg = createSendNft(appContext, testContext.testAddressTwo, tokenId, testContext.testAddressOne);
    let wasmErrorComparison = false;
    try {
      const response = await testContext.oneBroadcaster.broadcast({
        msgs: execMsg,
        gas: appContext.gasSettings,
      });
    } catch (error: any) {
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.sendToNonContract, error);
    }
    expect(wasmErrorComparison).toBe(true);
  });

  // sendNFT to dummy contract success sendToReceiver

  // sendNFT to dummy contract fail

  it(`Should fail to update collection info`, async () => {
    const execMsg = createUpdateCollectionInfo(appContext, testContext.testAddressOne);
    let wasmErrorComparison = false;
    try{
      const response = await testContext.oneBroadcaster.broadcast({
        msgs: execMsg,
        gas: appContext.gasSettings,
      })
    } catch (error: any) {
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.updateCollectionInfo, error);
    }
    expect(wasmErrorComparison).toBe(true);
  });

  it(`Should success to update collection info`, async () => {
    const execMsg = createUpdateCollectionInfo(appContext, appContext.primaryAddress);
    const response = await appContext.primaryBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    });
    expect(response.code).toBe(0);
    // update with royalties
    const execMsgRoyalties = createUpdateCollectionInfo(appContext, appContext.primaryAddress, {
      share: "0.05",
      payment_address: testContext.testAddressOne
    });
    const responseRoyalties = await appContext.primaryBroadcaster.broadcast({
      msgs: execMsgRoyalties,
      gas: appContext.gasSettings,
    });
    expect(responseRoyalties.code).toBe(0);
    // query general royalties
    const query = createExtensionQuery();
    const responseQuery:any = await generalCollectionGetter(appContext, query);
    expect(responseQuery.royalty_payments).toBe(true);
    // query specific royalties
    const queryRoyalty = createExtensionQuery(negativeTestTokenId);
    const responseRoyalty:any = await generalCollectionGetter(appContext, queryRoyalty);
    expect(responseRoyalty).toBeDefined();
    expect(responseRoyalty.address).toBe(testContext.testAddressOne);
    expect(responseRoyalty.royalty_amount).toBe("50000000000000000");
  });

});