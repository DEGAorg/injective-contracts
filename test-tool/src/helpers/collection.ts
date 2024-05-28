import { MsgExecuteContractCompat, toBase64 } from "@injectivelabs/sdk-ts";
import { AppContext } from "../context";
import { DegaCw721ExecuteMsg } from "../messages";
import { getNFTWeiPrice } from "./minter";

// Assistive functions for all write methods of Collection
export const createTransferNft = (appContext: AppContext, recipient: string, tokenId: string, sender: string): MsgExecuteContractCompat => {
  const contractMsg: DegaCw721ExecuteMsg = {
    transfer_nft: {
      recipient: recipient,
      token_id: tokenId,
    }
  }
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: sender,
    contractAddress: appContext.cw721Address,
    msg: contractMsg,
    funds: []
  })
  return execMsg
};

export const createBurnNft = (appContext: AppContext, tokenId: string, sender: string): MsgExecuteContractCompat => {
  const contractMsg: DegaCw721ExecuteMsg = {
    burn: {
      token_id: tokenId,
    }
  }
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: sender,
    contractAddress: appContext.cw721Address,
    msg: contractMsg,
    funds: []
  })
  return execMsg
}

export const createApproveToken = (appContext: AppContext, tokenId: string, spender: string, sender: string): MsgExecuteContractCompat => {
  const contractMsg: DegaCw721ExecuteMsg = {
    approve: {
      token_id: tokenId,
      spender: spender,
    }
  }
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: sender,
    contractAddress: appContext.cw721Address,
    msg: contractMsg,
    funds: []
  })
  return execMsg
}

export const createRevokeToken = (appContext: AppContext, tokenId: string, spender: string, sender: string): MsgExecuteContractCompat => {
  const contractMsg: DegaCw721ExecuteMsg = {
    revoke: {
      token_id: tokenId,
      spender: spender,
    }
  }
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: sender,
    contractAddress: appContext.cw721Address,
    msg: contractMsg,
    funds: []
  })
  return execMsg
}

export const createApproveAllToken = (appContext: AppContext, spender: string, sender: string): MsgExecuteContractCompat => {
  const contractMsg: DegaCw721ExecuteMsg = {
    approve_all: {
      operator: spender,
    }
  }
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: sender,
    contractAddress: appContext.cw721Address,
    msg: contractMsg,
    funds: []
  })
  return execMsg
}

export const createRevokeAlltoken = (appContext: AppContext, spender: string, sender: string): MsgExecuteContractCompat => {
  const contractMsg: DegaCw721ExecuteMsg = {
    revoke_all: {
      operator: spender,
    }
  }
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: sender,
    contractAddress: appContext.cw721Address,
    msg: contractMsg,
    funds: []
  })
  return execMsg
}

export const createSendNft = (appContext: AppContext, recipient: string, tokenId: string, sender: string): MsgExecuteContractCompat => {
  const price = getNFTWeiPrice(0.5)
  const sellTokenMsg = {
    sell_token: {
      token_id: tokenId,
      contract_address: appContext.cw721Address,
      class_id: "injective",
      price: {
        native: [
          {
            amount: price,
            denom: "inj"
          }
        ]
      }
    }
  };
  const contractMsg: DegaCw721ExecuteMsg = {
    send_nft: {
      contract: recipient,
      msg: toBase64(sellTokenMsg),
      token_id: tokenId,
    }
  }
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: sender,
    contractAddress: appContext.cw721Address,
    msg: contractMsg,
    funds: []
  })
  return execMsg
}

export const createUpdateCollectionInfo = (appContext: AppContext, sender: string): MsgExecuteContractCompat => {
  const contractMsg: DegaCw721ExecuteMsg = {
    update_collection_info: {
      collection_info: {
        description: "New description",
        external_link: "https://www.dega.org/v1",
        image: "https://www.dega.org/v1/image.png",
      }
    }
  }
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: sender,
    contractAddress: appContext.cw721Address,
    msg: contractMsg,
    funds: []
  })
  return execMsg
}

export const createMintMsg = (appContext: AppContext, recipient: string, sender: string): MsgExecuteContractCompat => {
  const contractMsg: DegaCw721ExecuteMsg = {
    mint: {
      owner: recipient,
      token_id: "200",
      token_uri: "https://www.google.com",
    }
  }
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: sender,
    contractAddress: appContext.cw721Address,
    msg: contractMsg,
    funds: []
  })
  return execMsg
}