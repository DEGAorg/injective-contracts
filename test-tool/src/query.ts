import {getAppContext} from "./context";
import {fromBase64, sha256, toBase64} from "@injectivelabs/sdk-ts";
import {DegaCw721QueryMsg, DegaMinterQueryMsg} from "./messages";
import secp256k1 from 'secp256k1'
import {MintRequest, SignerSourceTypeEnum} from "./messages/dega_minter_query";
import { execSync } from 'child_process';
import { Cw2981QueryMsg } from "./messages/dega_cw721_query";
import {createAdminsQuery, generalQueryGetter} from "./helpers/minter";
import {generalCollectionGetter} from "./helpers/collection";
import {logObjectFullDepth} from "./tests/setup";
import {CommandInfo} from "./main";
import {UsageError} from "./error";

let queryCommand: CommandInfo = {
    name: "query",
    aliases: ["q"],
    summary: "Query the contracts specified in the environment.",
    subCommands: []
};

export function getQueryCommand(): CommandInfo {
    return queryCommand;
}

export async function query(args: string[]) {

    let sub_command = "info"; // default to query

    let shift_result = args.shift();
    if (shift_result != undefined) {
        sub_command = shift_result;
    }

    const subCommand = queryCommand.subCommands.find((command) => command.name === sub_command);

    if (subCommand) {
        await subCommand.run(args);
    } else {
        console.log("Unknown test query sub-command: " + sub_command);
        return;
    }
}


queryCommand.subCommands.push({
    name: "sig-info",
    additionalUsage: "",
    summary: "Get detailed debugging info related to signatures.",
    run: querySigInfo
});

async function querySigInfo(args: string[]) {

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

queryCommand.subCommands.push({
    name: "check-sig",
    additionalUsage: "",
    summary: "A test query to check the signature of a text or mint request message.",
    run: queryCheckSig
});

export async function queryCheckSig(args: string[]) {

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

queryCommand.subCommands.push({
    name: "account-details",
    additionalUsage: "<address>",
    summary: "Get the account details of a provided injective address.",
    run: queryAccountDetails
});

async function queryAccountDetails(args: string[]) {

    if (args.length < 2) {
        throw new UsageError("Too few arguments")
    }

    let context = await getAppContext();

    const address = args[0];

    let execArgs = [];
    execArgs.push(`injectived`);
    execArgs.push(`--node="${context.cliNode}"`);
    execArgs.push(`query`);
    execArgs.push(`account`);
    execArgs.push(address);

    const accountQuery = execSync(execArgs.join(" "), {encoding: 'utf-8'});

    logObjectFullDepth(accountQuery);
}


queryCommand.subCommands.push({
    name: "royalty-info",
    additionalUsage: "",
    summary: "Get the royalty info from the collection contract.",
    run: queryRoyaltiesInfo
});
async function queryRoyaltiesInfo(args: string[]) {
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
    logObjectFullDepth(response);

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
    logObjectFullDepth(responseRoyaltyObject);
    return
}

queryCommand.subCommands.push({
name: "collection-info",
    additionalUsage: "",
    summary: "Get the collection info from the collection contract.",
    run: queryCollectionInfo
});

async function queryCollectionInfo(args: string[]) {
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
    logObjectFullDepth(response);
    return
}

queryCommand.subCommands.push({
    name: "minter-settings",
    additionalUsage: "",
    summary: "Get the settings info from the minter contract.",
    run: queryCollectionInfo
});
async function queryMinterSettings(args: string[]) {
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
    logObjectFullDepth(response);
    return
}

queryCommand.subCommands.push({
    name: "admins",
    additionalUsage: "",
    summary: "Get the list of contract admins from the minter contract.",
    run: queryAdmins
});

async function queryAdmins(args: string[]) {
    const response = await generalQueryGetter(await getAppContext(), createAdminsQuery());
    logObjectFullDepth(response);
}


queryCommand.subCommands.push({
    name: "tokens",
    additionalUsage: "<owner-address> [<start-after> [<limit>]]",
    summary: "Get the list of NFT tokens owned by a particular <owner-address>.",
    run: queryTokens
});
async function queryTokens(args: string[]) {

    if (args.length < 1 || args.length > 3) {
        throw new UsageError(`Bad arguments`);
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
    logObjectFullDepth(response);
}


queryCommand.subCommands.push({
    name: "all-tokens",
    additionalUsage: "[<start-after> [<limit>]]",
    summary: "Query through all tokens currently in the collection contract (does not include those burned).",
    run: queryAllTokens
});
async function queryAllTokens(args: string[]) {

    if (args.length > 2) {
        throw new UsageError(`Bad arguments`);
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
    logObjectFullDepth(response);
}

queryCommand.subCommands.push({
    name: "owner-of",
    additionalUsage: "<token-id> [<include-expired>]",
    summary: "Get the owner of a particular token with <token-id>.",
    run: queryOwnerOf
});
async function queryOwnerOf(args: string[]) {

    if (args.length < 1 || args.length > 2) {
        throw new UsageError(`Bad arguments`);
    }

    const tokenId = args[0];
    let includeExpiredString;
    let includeExpired;

    if (args.length == 2) {
        includeExpiredString = args[1];

        if (includeExpiredString != "true" && includeExpiredString != "false") {
            throw new UsageError(`Invalid include-expired value. Must be either true or false.`);
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
    logObjectFullDepth(response);
}

queryCommand.subCommands.push({
    name: "approval",
    additionalUsage: "<spender-address> <token-id> [<include-expired>]",
    summary: "Check whether a particular address with <spender-address> is an approved spender a particular <token-id>.",
    run: queryApproval
});
async function queryApproval(args: string[]) {

    if (args.length < 2 || args.length > 3) {
        throw new UsageError(`Bad arguments`);
    }

    const spenderAddress = args[0];
    const tokenId = args[1];
    let includeExpiredString;
    let includeExpired;

    if (args.length == 3) {
        includeExpiredString = args[2];

        if (includeExpiredString != "true" && includeExpiredString != "false") {
            throw new UsageError(`Invalid include-expired value. Must be either true or false.`);
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
    logObjectFullDepth(response);
}

queryCommand.subCommands.push({
    name: "all-approvals",
    additionalUsage: "<token-id> [<include-expired>]",
    summary: "Get the full list of approved spenders for a particular token with <token-id>. Optionally include expired approvals.",
    run: queryAllApprovals
});
async function queryAllApprovals(args: string[]) {

    if (args.length < 1 || args.length > 2) {
        throw new UsageError(`Bad arguments.`);
    }

    const tokenId = args[0];
    let includeExpiredString;
    let includeExpired;

    if (args.length == 2) {
        includeExpiredString = args[1];

        if (includeExpiredString != "true" && includeExpiredString != "false") {
            throw new UsageError(`Invalid include-expired value. Must be either true or false.`);
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
    logObjectFullDepth(response);
}

queryCommand.subCommands.push({
    name: "all-operators",
    additionalUsage: "<address> [<include-expired> [<start-after> [<limit>]]]",
    summary: "Check who the approved operator spenders are for a particular <address>. Optionally include expired approvals.",
    run: queryAllOperators
});
async function queryAllOperators(args: string[]) {

    if (args.length < 1 || args.length > 4) {
        throw new UsageError(`Bad arguments.`);
    }

    const owner = args[0];
    let includeExpiredString;
    let includeExpired;
    let startAfter;
    let limit;

    if (args.length > 1) {
        includeExpiredString = args[1];

        if (includeExpiredString != "true" && includeExpiredString != "false") {
            throw new UsageError(`Invalid include-expired value. Must be either true or false.`);
        }

        includeExpired = includeExpiredString == "true";

        if (args.length > 2) {

            startAfter = args[2];

            if (args.length == 4) {

                limit = parseInt(args[3]);
            }
        }
    }

    const tokenQuery: DegaCw721QueryMsg = {
        all_operators: {
            owner: owner,
            include_expired: includeExpired,
            start_after: startAfter,
            limit: limit,
        }
    };

    const response = await generalCollectionGetter(await getAppContext(), tokenQuery);
    logObjectFullDepth(response);
}

queryCommand.subCommands.push({
    name: "num-tokens",
    additionalUsage: "",
    summary: "Get the total number of issued tokens from the collection contract.",
    run: queryNumTokens
});
async function queryNumTokens(args: string[]) {

    if (args.length > 1) {
        throw new UsageError(`Arguments provided when none should be`);
    }

    const query: DegaCw721QueryMsg = {
        num_tokens: {}
    };

    const response = await generalCollectionGetter(await getAppContext(), query);
    logObjectFullDepth(response);
}

queryCommand.subCommands.push({
    name: "nft-info",
    additionalUsage: "<token-id>",
    summary: "Get the metadata for a particular token with <token-id>.",
    run: queryNftInfo
});
async function queryNftInfo(args: string[]) {

    if (args.length != 1) {
        throw new UsageError(`Bad arguments`);
    }

    const tokenId = args[0];

    const query: DegaCw721QueryMsg = {
        nft_info: {
            token_id: tokenId,
        }
    };

    const response = await generalCollectionGetter(await getAppContext(), query);
    logObjectFullDepth(response);
}

queryCommand.subCommands.push({
    name: "all-nft-info",
    additionalUsage: "<token-id> [<include-expired>]",
    summary: "Get the metadata, as well as owner and approved spenders for a particular token with <token-id>.",
    run: queryAllNftInfo
});
async function queryAllNftInfo(args: string[]) {

    if (args.length < 1 || args.length > 2) {
        throw new UsageError(`Bad arguments.`);
    }

    const tokenId = args[0];
    let includeExpiredString;
    let includeExpired;

    if (args.length == 2) {
        includeExpiredString = args[1];

        if (includeExpiredString != "true" && includeExpiredString != "false") {
            throw new UsageError(`Invalid include-expired value. Must be either true or false.`);
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
    logObjectFullDepth(response);
}

queryCommand.subCommands.push({
    name: "collection-contract-info",
    additionalUsage: "",
    summary: "Query the contract info for the collection contract.",
    run: queryCollectionContractInfo
});
async function queryCollectionContractInfo(args: string[]) {

    if (args.length > 1) {
        throw new UsageError(`Arguments provided when none should be.`);
    }

    const query: DegaCw721QueryMsg = {
        contract_info: {}
    };

    const response = await generalCollectionGetter(await getAppContext(), query);
    logObjectFullDepth(response);
}