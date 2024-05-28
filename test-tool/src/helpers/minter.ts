import { MsgExecuteContractCompat, fromBase64, sha256, toBase64 } from "@injectivelabs/sdk-ts";
import secp256k1 from "secp256k1";
import { v4 as uuidv4 } from "uuid";
import { AppContext } from "../context";
import { DegaMinterExecuteMsg, DegaMinterQueryMsg } from "../messages";
import { BigNumberInBase, BigNumberInWei } from "@injectivelabs/utils";
import { TestContext } from "../tests/testContext";
import { WasmError } from "../types/wasm";
import { SignerSourceTypeEnum } from "../messages/dega_minter_query";
import { MintRequest } from "../messages/dega_minter_execute";
import { generatePrivateKey } from "../config";


// Assistive functions for mint method of Minter

export const compareWasmError = (message: string, error: WasmError) =>{
  return error.originalMessage.includes(message);
}

export const getNFTWeiPrice = (nftPrice: number): string => {
  return new BigNumberInBase(nftPrice).toWei().toFixed();
};

export const getNowInSeconds = (): number => {
  return Math.floor(Date.now() / 1000);
};

export const getValidTimes = (): [number, number] => {
  const nowInSeconds = getNowInSeconds();
  const startTimeInSeconds: number = nowInSeconds - 5; // 5 seconds ago
  const endTimeInSeconds: number = nowInSeconds + 60 * 5; // 5 minutes from now
  return [startTimeInSeconds, endTimeInSeconds];
}

export const createMintRequest = (appContext: AppContext, price: string, recipient: string, primarySaleRecipient?: string): MintRequest => {
  primarySaleRecipient = primarySaleRecipient || appContext.primaryAddress;
  const [startTimeInSeconds, endTimeInSeconds] = getValidTimes();
  return {
    to: recipient,
    primary_sale_recipient: primarySaleRecipient,
    uri: "https://example.com",
    price: price,
    currency: "inj",
    validity_start_timestamp: startTimeInSeconds.toString(),
    validity_end_timestamp: endTimeInSeconds.toString(),
    uuid: uuidv4(),
    collection: appContext.cw721Address,
  };
}

const createSignature = (mintRequestMsg: MintRequest, appContext: AppContext, unAuthorized: boolean = false): [Buffer, Buffer] => {
  let rawMessage = Buffer.from(toBase64(mintRequestMsg), "base64")
  let msgMd5Hash = Buffer.from(sha256(rawMessage))
  let signature: Buffer;
  if (unAuthorized) {
    const randomPK = generatePrivateKey();
    const randomSigningKey = Buffer.from(randomPK.toPrivateKeyHex().slice(2), "hex");
    signature = Buffer.from(secp256k1.ecdsaSign(msgMd5Hash, randomSigningKey).signature);
  } else {
    signature = Buffer.from(secp256k1.ecdsaSign(msgMd5Hash, appContext.signerSigningKey).signature)
  }
  return [msgMd5Hash, signature];
};

export const createCheckSigQuery = (mintRequestMsg: MintRequest, signature: Buffer, appContext: AppContext): DegaMinterQueryMsg => {
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

export const exeCheckSigQuery = async (appContext: AppContext, checkSigQuery: DegaMinterQueryMsg): Promise<object> => {
  const checkSigQueryResponse = await appContext.queryWasmApi.fetchSmartContractState(appContext.minterAddress, toBase64(checkSigQuery));
  return fromBase64(Buffer.from(checkSigQueryResponse.data).toString("base64"));
}

export const createExecuteMintMessage = (appContext: AppContext, mintRequestMsg: MintRequest, signature: Buffer, sender: string): MsgExecuteContractCompat => {
  const mintMsg: DegaMinterExecuteMsg = {
    mint: {
      request: mintRequestMsg,
      signature: signature.toString("base64")
    }
  };
  const execMsg = MsgExecuteContractCompat.fromJSON({
    sender: sender,
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

export const createBasicTx = async (appContext: AppContext, recipient: string, price: number = 0.5, unAuthorized:boolean = false): Promise<[MintRequest, Buffer]> => {
  // Create Mint Request And Signature
  let nft_price_wei = getNFTWeiPrice(price)
  // console.warn(`=====NFT Price: ${nft_price_wei}`);
  let mintRequestMsg = createMintRequest(appContext, nft_price_wei, recipient);
  const [msgMd5Hash, signature] = createSignature(mintRequestMsg, appContext, unAuthorized);
  console.log("PubKey Compressed: " + appContext.signerCompressedPublicKey.toString("base64"));

  // Check Signature
  let checkSigQuery: DegaMinterQueryMsg = createCheckSigQuery(mintRequestMsg, signature, appContext);
  const checkSigQueryResponseObject: object = await exeCheckSigQuery(appContext, checkSigQuery);

  console.log(checkSigQueryResponseObject);
  console.log();
  console.log("Test Query Locally Calculated Message Hash: " + msgMd5Hash.toString("hex"));
  return [mintRequestMsg, signature];
}

export const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const sanitizedMaxNumber = (num: number, max: number): number => {
  return num > max ? max : num;
};
