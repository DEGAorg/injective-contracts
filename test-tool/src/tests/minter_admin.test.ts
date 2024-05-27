import { MsgExecuteContractCompat, fromBase64, toBase64 } from "@injectivelabs/sdk-ts";
import { AppContext, getAppContext } from "../context";
import { DegaMinterExecuteMsg, DegaMinterQueryMsg } from "../messages";
import { UpdateAdminCommand } from "../messages/dega_minter_execute";
import { TestContext, getTestContext } from "./testContext";
import { compareWasmError } from "../helpers/wasm";
import { logObjectFullDepth } from "./setup";

const ERROR_MESSAGES = {
  unAuthorized: `( Operation unauthorized: ( Only admins can update admins. ) ): execute wasm contract failed`,
  settings: `( Operation unauthorized: ( Only admins can update settings ) ): execute wasm contract failed`,
}
describe(`DEGA Minter Admin Tests`, () => {
  let appContext: AppContext;
  let testContext: TestContext;
  beforeAll(async () => {
    appContext = await getAppContext();
    testContext = await getTestContext();
  });

  it(`should fail to add an admin if the sender is not an admin`, async () => {
    const newAdminAddress = testContext.testAddressThree;
    const contractMsg: DegaMinterExecuteMsg = {
      update_admin: {
        address: newAdminAddress,
        command: UpdateAdminCommand.Add,
      }
    };
    const execMsg = MsgExecuteContractCompat.fromJSON({
      sender: testContext.testAddressTwo,
      contractAddress: appContext.minterAddress,
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
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.unAuthorized, error);
    }
    expect(wasmErrorComparison).toEqual(true);
  });

  it(`should fail to remove an admin if the sender is not an admin`, async () => {
    const adminToRemove = appContext.primaryAddress;
    const contractMsg: DegaMinterExecuteMsg = {
      update_admin: {
        address: adminToRemove,
        command: UpdateAdminCommand.Remove,
      }
    };
    const execMsg = MsgExecuteContractCompat.fromJSON({
      sender: testContext.testAddressTwo,
      contractAddress: appContext.minterAddress,
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
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.unAuthorized, error);
    }
    expect(wasmErrorComparison).toEqual(true);
  });

  it(`should fail to pause the minting if the sender is not an admin`, async () => {
    const contractMsg: DegaMinterExecuteMsg = {
      update_settings: {
        settings: {
          minting_paused: true,
          signer_pub_key: appContext.signerCompressedPublicKey.toString("base64"),
        }
      }
    };
    const execMsg = MsgExecuteContractCompat.fromJSON({
      sender: testContext.testAddressTwo,
      contractAddress: appContext.minterAddress,
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
      wasmErrorComparison = compareWasmError(ERROR_MESSAGES.settings, error);
    }
    expect(wasmErrorComparison).toBe(true);
  });

  it(`should allow the admin to add new admins`, async () => {
    const newAdminAddress = testContext.testAddressThree;
    const contractMsg: DegaMinterExecuteMsg = {
      update_admin: {
        address: newAdminAddress,
        command: UpdateAdminCommand.Add,
      }
    };
    const execMsg = MsgExecuteContractCompat.fromJSON({
      sender: appContext.primaryAddress,
      contractAddress: appContext.minterAddress,
      msg: contractMsg,
      funds: []
    })

    const response = await appContext.primaryBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
  });

  it(`should allow the admin to remove admins`, async () => {
    const adminToRemove = testContext.testAddressThree;
    const contractMsg: DegaMinterExecuteMsg = {
      update_admin: {
        address: adminToRemove,
        command: UpdateAdminCommand.Remove,
      }
    };
    const execMsg = MsgExecuteContractCompat.fromJSON({
      sender: appContext.primaryAddress,
      contractAddress: appContext.minterAddress,
      msg: contractMsg,
      funds: []
    })

    const response = await appContext.primaryBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
  })

  it(`should allow the admin to toggle pause the minting`, async () => {
    const contractMsg: DegaMinterExecuteMsg = {
      update_settings: {
        settings: {
          minting_paused: true,
          signer_pub_key: appContext.signerCompressedPublicKey.toString("base64"),
        }
      }
    };
    const execMsg = MsgExecuteContractCompat.fromJSON({
      sender: appContext.primaryAddress,
      contractAddress: appContext.minterAddress,
      msg: contractMsg,
      funds: []
    })

    const response = await appContext.primaryBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
    // query the settings to know if it was updated
    const configQuery: DegaMinterQueryMsg = { config: {} };
    const configQueryResponse = await appContext.queryWasmApi.fetchSmartContractState(
      appContext.minterAddress,
      toBase64(configQuery),
    );
    const configQueryResponseObject: any = fromBase64(
      Buffer.from(configQueryResponse.data).toString("base64")
    );
    console.warn(configQueryResponseObject);
    expect(configQueryResponseObject.dega_minter_settings.minting_paused).toBe(true);
    // unpause the minting for other tests
    const unpauseContractMsg: DegaMinterExecuteMsg = {
      update_settings: {
        settings: {
          minting_paused: false,
          signer_pub_key: appContext.signerCompressedPublicKey.toString("base64"),
        }
      }
    };
    const unpauseExecMsg = MsgExecuteContractCompat.fromJSON({
      sender: appContext.primaryAddress,
      contractAddress: appContext.minterAddress,
      msg: unpauseContractMsg,
      funds: []
    })
    const unpauseResponse = await appContext.primaryBroadcaster.broadcast({
      msgs: unpauseExecMsg,
      gas: appContext.gasSettings,
    })
    expect(unpauseResponse.code).toBe(0);
  });
});