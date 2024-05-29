import { MsgExecuteContractCompat } from "@injectivelabs/sdk-ts";
import { AppContext } from "../context";
import { DegaMinterExecuteMsg } from "../messages";
import { UpdateAdminCommand } from "../messages/dega_minter_execute";

// Assistive functions for admin method of Minter

export const createAddAdminMsg = (newAdminAddress: string, appContext: AppContext, sender: string): MsgExecuteContractCompat => {
  const contractMsg: DegaMinterExecuteMsg = {
    update_admin: {
      address: newAdminAddress,
      command: UpdateAdminCommand.Add,
    }
  };
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: sender,
    contractAddress: appContext.minterAddress,
    msg: contractMsg,
    funds: []
  })
  return execMsg;
}; 

export const createRemoveAdminMsg = (adminToRemove: string, appContext: AppContext, sender: string): MsgExecuteContractCompat => {
  const contractMsg: DegaMinterExecuteMsg = {
    update_admin: {
      address: adminToRemove,
      command: UpdateAdminCommand.Remove,
    }
  };
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: sender,
    contractAddress: appContext.minterAddress,
    msg: contractMsg,
    funds: []
  })
  return execMsg;
};

export const createUpdateSettingsMsg = (appContext: AppContext, paused: boolean, minter: string, sender: string): MsgExecuteContractCompat => {
  const contractMsg: DegaMinterExecuteMsg = {
    update_settings: {
      settings: {
        minting_paused: paused,
        signer_pub_key: minter
      }
    }
  };
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: sender,
    contractAddress: appContext.minterAddress,
    msg: contractMsg,
    funds: []
  });
  return execMsg;
};