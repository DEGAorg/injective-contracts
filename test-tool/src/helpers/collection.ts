import { MsgExecuteContractCompat, fromBase64, toBase64 } from "@injectivelabs/sdk-ts";
import { AppContext } from "../context";
import { DegaCw721ExecuteMsg, DegaCw721QueryMsg } from "../messages";
import { getNFTWeiPrice } from "./minter";
import { Cw2981QueryMsg } from "../messages/dega_cw721_query";
import { RoyaltySettingsResponse } from "../messages/dega_cw721_execute";

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

export const createUpdateCollectionInfo = (appContext: AppContext, sender: string, royaltiesConfig?: RoyaltySettingsResponse): MsgExecuteContractCompat => {
  const contractMsg: DegaCw721ExecuteMsg = {
    update_collection_info: {
      collection_info: {
        description: "New description",
        external_link: "https://www.dega.org/v1",
        image: "https://www.dega.org/v1/image.png",
        royalty_settings: royaltiesConfig
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

// Assistive functions for all read methods of Collection
export const generalCollectionGetter = async (appContext: AppContext, query: DegaCw721QueryMsg): Promise<object> => {
  const queryResponse = await appContext.queryWasmApi.fetchSmartContractState(appContext.cw721Address, toBase64(query));
  return fromBase64(Buffer.from(queryResponse.data).toString("base64"));
}
// owner_of
export const createOwnerOfQuery = (tokenId: string, includeExpired: boolean): DegaCw721QueryMsg => {
  return {
    owner_of: {
      token_id: tokenId,
      include_expired: includeExpired,
    }
  }
}

// appoval
export const createApprovalQuery = (tokenId: string, spender: string, includeExpired: boolean): DegaCw721QueryMsg => {
  return {
    approval: {
      token_id: tokenId,
      spender: spender,
      include_expired: includeExpired,
    }
  }
}
// aprovals
export const createApprovalsQuery = (tokenId: string, includeExpired: boolean): DegaCw721QueryMsg => {
  return {
    approvals: {
      token_id: tokenId,
      include_expired: includeExpired,
    }
  }
}
// all_operators
export const createAllOperatorsQuery = (owner: string, includeExpired: boolean, limit: number, startAfter: string): DegaCw721QueryMsg => {
  return {
    all_operators: {
      owner: owner,
      include_expired: includeExpired,
      limit: limit,
      start_after: startAfter,
    }
  }
}
// num_tokens
export const createNumTokensQuery = (): DegaCw721QueryMsg => {
  return {
    num_tokens: {}
  }
}
// contract_info
export const createContractInfoQuery = (): DegaCw721QueryMsg => {
  return {
    contract_info: {}
  }

}
// nft_info
export const createNftInfoQuery = (tokenId: string): DegaCw721QueryMsg => {
  return {
    nft_info: {
      token_id: tokenId,
    }
  }
}
// all_nft_info
export const createAllNftInfoQuery = (includeExpired: boolean, tokenId: string): DegaCw721QueryMsg => {
  return {
    all_nft_info: {
      include_expired: includeExpired,
      token_id: tokenId,
    }
  }
}
// tokens
export const createTokensQuery = (owner: string, startAfter: string, limit: number): DegaCw721QueryMsg => {
  return {
    tokens: {
      owner: owner,
      start_after: startAfter,
      limit: limit,
    }
  }
}
// all_tokens
export const createAllTokensQuery = (startAfter: string, limit: number): DegaCw721QueryMsg => {
  return {
    all_tokens: {
      start_after: startAfter,
      limit: limit,
    }
  }
}
// minter
export const createMinterQuery = (): DegaCw721QueryMsg => {
  return {
    minter: {}
  }
}
// collection_info
export const createCollectionInfoQuery = (): DegaCw721QueryMsg => {
  return {
    collection_info: {}
  }
}
// extension
export const createExtensionQuery = (tokenId?: string): DegaCw721QueryMsg => {
  const message = tokenId ? {
    royalty_info: {
      token_id: tokenId,
      sale_price: '1000000000000000000'
    }
  } : {
    check_royalties: {
    }
  }
  return {
    extension: {
      msg: message
    }
  }
}
// ownership
export const createOwnershipQuery = (): DegaCw721QueryMsg => {
  return {
    ownership: {
    }
  }
}