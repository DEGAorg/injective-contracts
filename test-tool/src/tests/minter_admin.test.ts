import { MsgExecuteContractCompat, fromBase64, toBase64 } from "@injectivelabs/sdk-ts";
import { AppContext, getAppContext } from "../context";
import { DegaMinterExecuteMsg, DegaMinterQueryMsg } from "../messages";
import { UpdateAdminCommand } from "../messages/dega_minter_execute";
import { TestContext, getTestContext } from "./testContext";
import { compareWasmError, createAdminsQuery, createConfigQuery, createIsAdminQuery, generalQueryGetter } from "../helpers/minter";
import { logObjectFullDepth } from "./setup";
import { createAddAdminMsg, createRemoveAdminMsg, createUpdateSettingsMsg } from "../helpers/minterAdmin";

const ERROR_MESSAGES = {
  unAuthorized: `( DEGA Minter Unauthorized Error: ( Only admins can update admins ) ): execute wasm contract failed`,
  settings: `( DEGA Minter Unauthorized Error: ( Only admins can update settings ) ): execute wasm contract failed`,
}
describe(`DEGA Minter Admin Tests`, () => {
  let appContext: AppContext;
  let testContext: TestContext;
  beforeAll(async () => {
    appContext = await getAppContext();
    testContext = await getTestContext();
  });

  it(`Should successfully read the admin list`, async () => {
    const query = createAdminsQuery();
    const response:any = await generalQueryGetter(appContext, query);
    expect(response).toBeDefined();
    expect(response.admins.length).toBe(1);
  });

  it(`should fail to add an admin if the sender is not an admin`, async () => {
    const newAdminAddress = testContext.testAddressThree;
    const execMsg = createAddAdminMsg(newAdminAddress, appContext, testContext.testAddressTwo);

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
    const execMsg = createRemoveAdminMsg(adminToRemove, appContext, testContext.testAddressTwo);

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
    const execMsg = createUpdateSettingsMsg(appContext, true, appContext.signerCompressedPublicKey.toString("base64"), testContext.testAddressTwo);

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
    const execMsg = createAddAdminMsg(newAdminAddress, appContext, appContext.primaryAddress);

    const response = await appContext.primaryBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
    const query = createAdminsQuery();
    const responseObject: any = await generalQueryGetter(appContext, query);
    expect(responseObject.admins.length).toBe(2);
    const newAdmin = createIsAdminQuery(newAdminAddress);
    const newAdminResponse = await generalQueryGetter(appContext, newAdmin);
    expect(newAdminResponse).toBe(true);
  });

  it(`should allow the admin to remove admins`, async () => {
    const adminToRemove = testContext.testAddressThree;
    const execMsg = createRemoveAdminMsg(adminToRemove, appContext, appContext.primaryAddress);

    const response = await appContext.primaryBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
    const query = createAdminsQuery();
    const responseObject: any = await generalQueryGetter(appContext, query);
    expect(responseObject.admins.length).toBe(1);
    const removedAdmin = createIsAdminQuery(adminToRemove);
    const removedAdminResponse = await generalQueryGetter(appContext, removedAdmin);
    expect(removedAdminResponse).toBe(false);
  })

  it(`should allow the admin to toggle pause the minting`, async () => {
    const execMsg = createUpdateSettingsMsg(appContext, true, appContext.signerCompressedPublicKey.toString("base64"), appContext.primaryAddress);

    const response = await appContext.primaryBroadcaster.broadcast({
      msgs: execMsg,
      gas: appContext.gasSettings,
    })
    expect(response.code).toBe(0);
    // query the settings to know if it was updated
    const configQuery = createConfigQuery();
    const configQueryResponseObject: any = await generalQueryGetter(appContext, configQuery);
    // console.warn(configQueryResponseObject);
    expect(configQueryResponseObject.dega_minter_settings.minting_paused).toBe(true);
    // unpause the minting for other tests
    const unpauseExecMsg = createUpdateSettingsMsg(appContext, false, appContext.signerCompressedPublicKey.toString("base64"), appContext.primaryAddress);
    const unpauseResponse = await appContext.primaryBroadcaster.broadcast({
      msgs: unpauseExecMsg,
      gas: appContext.gasSettings,
    })
    expect(unpauseResponse.code).toBe(0);
  }, 30000);
});