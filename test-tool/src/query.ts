import {getAppContext} from "./context";
import {Config} from "./config";
import {fromBase64, sha256, toBase64} from "@injectivelabs/sdk-ts";
import {DegaCw721QueryMsg, DegaMinterQueryMsg} from "./messages";
import { Wallet } from 'ethers'
import { SigningKey } from '@ethersproject/signing-key'
import { Address as EthereumUtilsAddress } from 'ethereumjs-util'
import secp256k1 from 'secp256k1'
import { randomBytes } from 'crypto'
import { bech32 } from 'bech32'
import {MintRequest, SignerSourceTypeEnum} from "./messages/dega_minter_query";
import {getNetworkEndpoints, Network} from "@injectivelabs/networks";
import { execSync } from 'child_process';
import { Cw2981QueryMsg } from "./messages/dega_cw721_query";
import {createAdminsQuery, generalQueryGetter} from "./helpers/minter";
import {createTokensQuery, generalCollectionGetter} from "./helpers/collection";

export async function query(args: string[]) {

    let sub_command = "info"; // default to query
    let sub_args = new Array<string>();

    let shift_result = args.shift();
    if (shift_result != undefined) {
        sub_command = shift_result;
    }

    switch (sub_command) {
        case "info":
            await info(args);
            break;
        case "check-sig":
            await checkSig(args);
            break;
        case "sig-info":
            await sigInfo(args);
            break;
        case "derive-eth":
            await deriveEthBasedAddress();
            break;
        case "signing-details":
            await signingDetails(args);
            break;
        case "check-royalties":
            await queryRoyaltiesInfo(args);
            break;
        case "collection-info":
            await queryCollectionInfo(args);
            break;
        case "minter-settings":
            await queryMinterSettings(args);
            break;
        case "admins":
            await queryAdmins(args);
            break;
        case "tokens":
            await queryTokens(args);
            break;
        case "all-tokens":
            await queryAllTokens(args);
            break;
        case "owner-of":
            await queryOwnerOf(args);
            break;
        case "approval":
            await queryApproval(args);
            break;
        case "all-approvals":
            await queryAllApprovals(args);
            break;
        case "all-operators":
            await queryAllOperators(args);
            break;
        case "num-tokens":
            await queryNumTokens(args);
            break;
        case "nft-info":
            await queryNftInfo(args);
            break;
        case "all-nft-info":
            await queryAllNftInfo(args);
            break;
        case "print-base64-object":
            printBase64Object(args);
            break;
        default:
            console.log("Unknown test query sub-command: " + sub_command);
            break;
    }
}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        
export async function info(args: string[]) {

    const context = await getAppContext();

    const bankBalances = await context.queryBankApi.fetchBalances(context.primaryAddress);
    console.log(bankBalances);

    //const queryFromObject = toBase64({ get_coin: {} })

    // let signedVAA: Uint8Array = new Uint8Array(0);
    // let otherQuert = {
    //     is_vaa_redeemed: {
    //         vaa: fromUint8Array(signedVAA),
    //     }
    // };

    let configQuery: DegaMinterQueryMsg = {config: {}};
    const configQueryResponse = await context.queryWasmApi.fetchSmartContractState(
        context.minterAddress,
        toBase64(configQuery),
    );

    const configQueryResponseObject: object = fromBase64(
        Buffer.from(configQueryResponse.data).toString("base64")
    );
    //const { count } = configQueryResponseObject as { count: number };

    console.log(configQueryResponseObject);

    let collectionInfoQuery: DegaCw721QueryMsg = {collection_info: {}};

    const collectionInfoQueryResponse = await context.queryWasmApi.fetchSmartContractState(
        context.cw721Address,
        toBase64(collectionInfoQuery),
    );

    const collectionInfoQueryResponseObject: object = fromBase64(
        Buffer.from(collectionInfoQueryResponse.data).toString("base64")
    );
    //const { count } = collectionInfoQueryResponseObject as { count: number };

    console.log(collectionInfoQueryResponseObject);

}



export async function checkSig(args: string[]) {

    const context = await getAppContext();

    let mintRequestMsg: MintRequest = {
        to: context.primaryAddress,
        primary_sale_recipient: context.primaryAddress,
        uri: "https://www.domain.com",
        price: "0",
        currency: context.primaryAddress,
        validity_start_timestamp: "0",
        validity_end_timestamp: "0",
        uuid: "00000000-0000-0000-0000-000000000000",
        collection: context.cw721Address
    };

    let mintRequestBase64 = toBase64(mintRequestMsg);


    let rawMessage = Buffer.from(mintRequestBase64, "base64");
    let msgMd5Hash = Buffer.from(sha256(rawMessage))
    //let uint8Array = new Uint8Array(buffer);


    let signingKey = context.signerSigningKey
    let signature = Buffer.from(secp256k1.ecdsaSign(msgMd5Hash, signingKey).signature)

    let sigBase64 = signature.toString("base64");

    console.log("Sig Length: " + sigBase64.length);

    console.log("Tx: ");
    console.log(mintRequestMsg);
    console.log();
    console.log("Signature: " + sigBase64);
    console.log();
    console.log("Address: " + context.signerAddress);
    console.log();

    let checkSigQuery: DegaMinterQueryMsg = {
        check_sig: {
            message: {
                mint_request: mintRequestMsg
                //string: rawTextMessage // Uncomment to test with a string instead of the mint request
            },
            signature: sigBase64,
            //signer_source: SignerSourceTypeEnum.ConfigSignerPubKey
            // Uncomment below to test validating with a local public key using on chain logic
            signer_source: {
                pub_key_binary: Buffer.from(context.signerCompressedPublicKey).toString("base64")
            }
        }
    };

    const checkSigQueryResponse = await context.queryWasmApi.fetchSmartContractState(
        context.minterAddress,
        toBase64(checkSigQuery) // as DegaMinterQueryMsg),
    );

    const checkSigQueryResponseObject: object = fromBase64(
        Buffer.from(checkSigQueryResponse.data).toString("base64")
    );

    console.log(checkSigQueryResponseObject);
}

async function sigInfo(args: string[]) {

    const context = await getAppContext();

    let rawTextMessage = "test message";

    let mintRequestMsg: MintRequest = {
        to: context.primaryAddress,
        primary_sale_recipient: context.primaryAddress,
        uri: "https://www.domain.com",
        price: "0",
        currency: "inj",
        validity_start_timestamp: "0",
        validity_end_timestamp: "0",
        uuid: "00000000-0000-0000-0000-000000000000",
        collection: context.cw721Address
    };

    //let rawMessage = Buffer.from(rawTextMessage, "utf-8");
    let rawMessage = Buffer.from(toBase64(mintRequestMsg), "base64");


    //let mintRequestBase64 = toBase64({md5_hash} );

    let msgMd5Hash = Buffer.from(sha256(rawMessage)); // echo -n 'test message' | sha256sum
    let msgHashHex = msgMd5Hash.toString("hex");

    let signingKey = context.signerSigningKey;
    //let signingKey = randomBytes(32);

    //console.log("Signing Key Hex: " + signingKey.toString("hex"));
    //console.log("Signing Key Base64: " + signingKey.toString("base64"));
    //console.log("Signing Key Length: " + signingKey.length);

    let publicKey = context.signerCompressedPublicKey;

    console.log("Compressed Pubkey Hex: " + publicKey.toString("hex"));
    console.log("Compressed Pubkey Base64: " + publicKey.toString("base64"));
    console.log("Compressed Pubkey Length: " + publicKey.length);

    let signature = Buffer.from(secp256k1.ecdsaSign(msgMd5Hash, signingKey).signature);
    let sigHex = signature.toString("hex");
    let sigBase64 = signature.toString("base64");

    console.log("Message Hash: ");
    console.log(msgHashHex);
    console.log();
    console.log("Signature Hex: " + sigHex);
    console.log("Signature Base64: " + sigBase64);
    console.log("Signature Length: " + signature.length);
    console.log();
    console.log("Address: " + context.signerAddress);
    console.log();

    let checkSigQuery: DegaMinterQueryMsg = {
        check_sig: {
            message: {
                mint_request: mintRequestMsg
                //string: rawTextMessage
            },
            signature: sigBase64,
            signer_source: SignerSourceTypeEnum.ConfigSignerPubKey
            // signer_source: {
            //     pub_key_binary: Buffer.from(Context.signerCompressedPublicKey).toString("base64")
            // }
        }
    };

    const checkSigQueryResponse =
        await context.queryWasmApi.fetchSmartContractState(
        context.minterAddress,
        toBase64(checkSigQuery));

    const checkSigQueryResponseObject: object = fromBase64(
        Buffer.from(checkSigQueryResponse.data).toString("base64")
    );

    console.log(checkSigQueryResponseObject);
}


// https://docs.injective.network/learn/basic-concepts/accounts/#:~:text=Injective%20defines%20its%20own%20custom,'%2F0'%2F0%20.
async function deriveEthBasedAddress() {
    const mnemonic = Config.PRIVATE_KEY_MNEMONIC;
    //const privateKey = "private key seed hex"
    const wallet = Wallet.fromMnemonic(mnemonic);
    const privateKey = wallet.privateKey;
    const defaultDerivationPath = "m/44'/60'/0'/0/0"
    const defaultBech32Prefix = 'inj'
    const isPrivateKey: boolean = true /* just for the example */

    //const wallet = isPrivateKey ? Wallet.fromMnemonic(mnemonic, defaultDerivationPath) : new Wallet(privateKey)
    const ethereumAddress = wallet.address
    const addressBuffer = EthereumUtilsAddress.fromString(ethereumAddress.toString()).toBuffer()
    const addressBufferHex = addressBuffer.toString('hex');
    const injectiveAddress = bech32.encode(defaultBech32Prefix, bech32.toWords(addressBuffer))

    console.log("mnemonic:")
    console.log(mnemonic)

    console.log("private key seed hex:")
    console.log(privateKey)

    console.log("injectiveAddress:")
    console.log(injectiveAddress)
}

async function deriveSecp256k1Address() {
    const context = await getAppContext();

    const privateKey = context.primaryPrivateKey.toPrivateKeyHex()
    const privateKeyHex = Buffer.from(privateKey, 'hex')
    const publicKeyByte = secp256k1.publicKeyCreate(privateKeyHex)

    const buf1 = Buffer.from([10])
    const buf2 = Buffer.from([publicKeyByte.length])
    const buf3 = Buffer.from(publicKeyByte)

    const publicKey = Buffer.concat([buf1, buf2, buf3]).toString('base64')
    const type = '/injective.crypto.v1beta1.ethsecp256k1.PubKey'
}

async function signingDetails(args: string[]) {

    if (args.length < 2) {
        console.log("Usage: query signing-details <network> <address>");
        return;
    }

    const networkString = args[0];
    const address = args[1];

    let network;
    let rpcEndpoint;

    if (networkString === "mainnet") {
        network = Network.Mainnet;
        rpcEndpoint = "https://sentry.tm.injective.network:443";
    } else if (networkString === "testnet") {
        network = Network.Testnet;
        rpcEndpoint = "https://testnet.sentry.tm.injective.network:443";
    } else if (networkString === "local") {
        network = Network.Local;
        rpcEndpoint = "http://localhost:26657";
    } else {
        console.log("Invalid network: " + networkString);
        return;
    }

    console.log("RPC Endpoint: " + rpcEndpoint);

    let execArgs = [];
    execArgs.push(`injectived`);
    execArgs.push(`--node="${rpcEndpoint}"`);
    execArgs.push(`query`);
    execArgs.push(`account`);
    execArgs.push(address)

    const accountQuery = execSync(execArgs.join(" "), {encoding: 'utf-8'});

    console.log(accountQuery);
}

// query royalty info
const queryRoyaltiesInfo = async (args: string[]) => {
    const context = await getAppContext();

    const cw2981Message: Cw2981QueryMsg = {
        check_royalties: {
        }
    }

    const query:DegaCw721QueryMsg = {
        extension: {
            msg: cw2981Message
        }
    }

    const queryResponse = await context.queryWasmApi.fetchSmartContractState(
        context.cw721Address,
        toBase64(query)
    );

    const response = fromBase64(Buffer.from(queryResponse.data).toString("base64"));
    console.log(response);

    const cw2981Royalty: Cw2981QueryMsg = {
        royalty_info:{
            token_id: "1",
            sale_price: "1000000000000000000",
        }
    }

    if(query.extension === undefined) {
        return;
    }
    query.extension.msg = cw2981Royalty
    const responseRoyalty = await context.queryWasmApi.fetchSmartContractState(
        context.cw721Address,
        toBase64(query)
    );
    const responseRoyaltyObject = fromBase64(Buffer.from(responseRoyalty.data).toString("base64"));
    console.log(responseRoyaltyObject);
    return
}

// query all operators
const queryAllOperators = async (args: string[]) => {
    const context = await getAppContext();

    const cw721Query: DegaCw721QueryMsg = {
        all_operators: {
            owner: context.primaryAddress,
            include_expired: false,
            limit: 10,
            start_after: ""
        }
    }

    const queryResponse = await context.queryWasmApi.fetchSmartContractState(
        context.cw721Address,
        toBase64(cw721Query)
    );

    const response = fromBase64(Buffer.from(queryResponse.data).toString("base64"));
    console.log(response);
    return
}

// collection info
const queryCollectionInfo = async (args: string[]) => {
    const context = await getAppContext();

    const cw721Query: DegaCw721QueryMsg = {
        collection_info: {
        }
    }

    const queryResponse = await context.queryWasmApi.fetchSmartContractState(
        context.cw721Address,
        toBase64(cw721Query)
    );

    const response = fromBase64(Buffer.from(queryResponse.data).toString("base64"));
    console.log(response);
    return
}

// minter settings
const queryMinterSettings = async (args: string[]) => {
    const context = await getAppContext();

    const minterQuery: DegaMinterQueryMsg = {
        config: {
        }
    }

    const queryResponse = await context.queryWasmApi.fetchSmartContractState(
        context.minterAddress,
        toBase64(minterQuery)
    );

    const response = fromBase64(Buffer.from(queryResponse.data).toString("base64"));
    console.log(response);
    return
}

async function queryAdmins(args: string[]) {
    const response = await generalQueryGetter(await getAppContext(), createAdminsQuery());
    console.log(response);
}

async function queryTokens(args: string[]) {

    const usage = "Usage: query tokens <address> [<start-after> [<limit>]]";

    if (args.length < 1 || args.length > 3) {
        console.log(`Bad arguments. ${usage}`);
        return;
    }

    const owner = args[0];
    let startAfter;
    let limit;

    if (args.length > 1) {
        startAfter = args[1];
        if (args.length > 2) {
            limit = parseInt(args[2]);
        }
    }

    const tokenQuery: DegaCw721QueryMsg = {
        tokens: {
            owner: owner,
            start_after: startAfter,
            limit: limit
        }
    };

    const response = await generalCollectionGetter(await getAppContext(), tokenQuery);
    console.log(response);
}

async function queryAllTokens(args: string[]) {

    const usage = "Usage: query all-tokens [<start-after> [<limit>]]";

    if (args.length > 2) {
        console.log(`Bad arguments. ${usage}`);
        return;
    }

    let startAfter;
    let limit;

    if (args.length > 0) {
        startAfter = args[0];
        if (args.length > 1) {
            limit = parseInt(args[1]);
        }
    }

    const tokenQuery: DegaCw721QueryMsg = {
        all_tokens: {
            start_after: startAfter,
            limit: limit
        }
    };

    const response = await generalCollectionGetter(await getAppContext(), tokenQuery);
    console.log(response);
}


async function queryOwnerOf(args: string[]) {

    const usage = "Usage: query owner-of <token-id> [<include-expired>]";

    if (args.length < 1 || args.length > 2) {
        console.log(`Bad arguments. ${usage}`);
        return;
    }

    const tokenId = args[0];
    let includeExpiredString;
    let includeExpired;

    if (args.length == 2) {
        includeExpiredString = args[1];

        if (includeExpiredString != "true" && includeExpiredString != "false") {
            console.log(`Invalid include-expired value. Must be either true or false. ${usage}`);
            return;
        }

        includeExpired = includeExpiredString == "true";
    }

    const query: DegaCw721QueryMsg = {
        owner_of: {
            token_id: tokenId,
            include_expired: includeExpired
        }
    };

    const response = await generalCollectionGetter(await getAppContext(), query);
    console.log(response);
}

async function queryApproval(args: string[]) {
    const usage = "Usage: query approval <spender> <token-id> [<include-expired>]";

    if (args.length < 2 || args.length > 3) {
        console.log(`Bad arguments. ${usage}`);
        return;
    }

    const spenderAddress = args[0];
    const tokenId = args[1];
    let includeExpiredString;
    let includeExpired;

    if (args.length == 3) {
        includeExpiredString = args[2];

        if (includeExpiredString != "true" && includeExpiredString != "false") {
            console.log(`Invalid include-expired value. Must be either true or false. ${usage}`);
            return;
        }

        includeExpired = includeExpiredString == "true";
    }

    const query: DegaCw721QueryMsg = {
        approval: {
            spender: spenderAddress,
            token_id: tokenId,
            include_expired: includeExpired
        }
    };

    const response = await generalCollectionGetter(await getAppContext(), query);
    console.log(response);
}

async function queryAllApprovals(args: string[]) {
    const usage = "Usage: query all-approvals <token-id> [<include-expired>]";

    if (args.length < 1 || args.length > 2) {
        console.log(`Bad arguments. ${usage}`);
        return;
    }

    const tokenId = args[0];
    let includeExpiredString;
    let includeExpired;

    if (args.length == 2) {
        includeExpiredString = args[1];

        if (includeExpiredString != "true" && includeExpiredString != "false") {
            console.log(`Invalid include-expired value. Must be either true or false. ${usage}`);
            return;
        }

        includeExpired = includeExpiredString == "true";
    }

    const query: DegaCw721QueryMsg = {
        approvals: {
            token_id: tokenId,
            include_expired: includeExpired
        }
    };

    const response = await generalCollectionGetter(await getAppContext(), query);
    console.log(response);
}

async function queryNumTokens(args: string[]) {

    const usage = "Usage: query num-tokens";

    if (args.length > 1) {
        console.log(`Arguments provided when none should be. ${usage}`);
        return;
    }

    const query: DegaCw721QueryMsg = {
        num_tokens: {}
    };

    const response = await generalCollectionGetter(await getAppContext(), query);
    console.log(response);
}

async function queryNftInfo(args: string[]) {
    const usage = "Usage: query nft-info <token-id>";

    if (args.length != 1) {
        console.log(`Bad arguments. ${usage}`);
        return;
    }

    const tokenId = args[0];

    const query: DegaCw721QueryMsg = {
        nft_info: {
            token_id: tokenId,
        }
    };

    const response = await generalCollectionGetter(await getAppContext(), query);
    console.log(response);
}

async function queryAllNftInfo(args: string[]) {
    const usage = "Usage: query all-nft-info <token-id> [<include-expired>]";

    if (args.length < 1 || args.length > 2) {
        console.log(`Bad arguments. ${usage}`);
        return;
    }

    const tokenId = args[0];
    let includeExpiredString;
    let includeExpired;

    if (args.length == 2) {
        includeExpiredString = args[1];

        if (includeExpiredString != "true" && includeExpiredString != "false") {
            console.log(`Invalid include-expired value. Must be either true or false. ${usage}`);
            return;
        }

        includeExpired = includeExpiredString == "true";
    }

    const query: DegaCw721QueryMsg = {
        all_nft_info: {
            token_id: tokenId,
            include_expired: includeExpired
        }
    };

    const response = await generalCollectionGetter(await getAppContext(), query);
    console.log(response);
}

const printBase64Object = (args: string[]) => {

    if (args.length < 1) {
        console.log("Usage: query print-base64-object <base64-string>");
        return;
    }

    const base64ObjectString = args[0];
    const object = fromBase64(base64ObjectString);
    console.log(object);
}
