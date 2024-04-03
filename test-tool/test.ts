import {getNetworkEndpoints, Network} from "@injectivelabs/networks";
import {
    ChainGrpcBankApi,
    ChainGrpcWasmApi,
    PrivateKey,
    toBase64,
    fromBase64,
    createTransaction,
} from "@injectivelabs/sdk-ts";
import { config } from "dotenv";

import {
    quicktype,
    InputData,
    jsonInputForTargetLanguage,
    JSONSchemaInput,
    FetchingJSONSchemaStore, IssueAnnotationData
} from "quicktype-core"
import {JSONSchemaSourceData} from "quicktype-core/dist/input/JSONSchemaInput";
import path from "node:path";
import * as fs from "fs";

import {
    DegaMinterQueryMsg
} from "./messages";
import {MintRequest} from "./messages/dega_minter_query";




config();

let PRIVATE_KEY_MNEMONIC = process.env.PRIVATE_KEY_MNEMONIC as string;
let USE_LOCAL = process.env.USE_LOCAL as string == "true";
let NETWORK = USE_LOCAL ? Network.Local : Network.Testnet;
let MINTER_ADDRESS = (USE_LOCAL ? process.env.MINTER_ADDRESS_LOCAL : process.env.MINTER_ADDRESS) as string;
let CW721_ADDRESS = (USE_LOCAL ? process.env.CW721_ADDRESS_LOCAL : process.env.CW721_ADDRESS) as string;

let SIGNER_KEY_MNEMONIC = process.env.SIGNER_KEY_MNEMONIC as string;

const primaryPrivateKey = PrivateKey.fromMnemonic(PRIVATE_KEY_MNEMONIC);
const primaryAddress = primaryPrivateKey.toBech32();

const signerPrivateKey = PrivateKey.fromMnemonic(SIGNER_KEY_MNEMONIC);
const signerAddress = signerPrivateKey.toBech32();

const endpoints = getNetworkEndpoints(NETWORK);

const chainGrpcBankApi = new ChainGrpcBankApi(endpoints.grpc);
const chainGrpcWasmApi = new ChainGrpcWasmApi(endpoints.grpc);

async function query() {

    const bankBalances = await chainGrpcBankApi.fetchBalances(primaryAddress);
    console.log(bankBalances);

    //const queryFromObject = toBase64({ get_coin: {} })

    // let signedVAA: Uint8Array = new Uint8Array(0);
    // let otherQuert = {
    //     is_vaa_redeemed: {
    //         vaa: fromUint8Array(signedVAA),
    //     }
    // };

    //let configQuery = {config: {}};
    const configQueryResponse = await chainGrpcWasmApi.fetchSmartContractState(
        MINTER_ADDRESS,
        toBase64({ config: {} } ),
    );

    const configQueryResponseObject: object = fromBase64(
        Buffer.from(configQueryResponse.data).toString("base64")
    );
    //const { count } = configQueryResponseObject as { count: number };

    console.log(configQueryResponseObject);

    const collectionInfoQueryResponse = await chainGrpcWasmApi.fetchSmartContractState(
        CW721_ADDRESS,
        toBase64({ collection_info: {} } ),
    );

    const collectionInfoQueryResponseObject: object = fromBase64(
        Buffer.from(collectionInfoQueryResponse.data).toString("base64")
    );
    //const { count } = collectionInfoQueryResponseObject as { count: number };

    console.log(collectionInfoQueryResponseObject);

}


// interface MintRequest {
//     to: string, // address
//     royaltyRecipient: string, // address
//     royaltyBps: string,  // uint256
//     primarySaleRecipient: string, // uint256
//     uri: string, // string (url)
//     price: string, // uint256
//     currency: string, // address
//     validityStartTimestamp: number, // uint128
//     validityEndTimestamp: number, // uint128
//     uid: number, // bytes32
// }


// Private Key based Transaction example: (Also includes details on signing a message with the cosmos library)
// https://github.com/InjectiveLabs/injective-ts/blob/ce8f591ea66e15f3a620734146a342ecb94bb2d6/.gitbook/transactions/private-key.md

// https://github.com/CosmWasm/cosmwasm/tree/main/packages/crypto
// https://github.com/CosmWasm/cosmwasm/blob/main/packages/crypto/src/secp256k1.rs

// See:
// fn secp256k1_verify
// fn ed25519_verify
// fn ed25519_batch_verify
//
// from DepsMut.Api in the smart contract parameters.

async function signerTest() {

    let mintRequestMsg: MintRequest = {
        to: primaryAddress,
        royalty_recipient: primaryAddress,
        royalty_bps: "0",
        primary_sale_recipient: primaryAddress,
        uri: "https://www.domain.com",
        price: "0",
        currency: primaryAddress,
        validity_start_timestamp: "0",
        validity_end_timestamp: "0",
        uid: 0,
    };

    let mintRequestBase64 = toBase64(mintRequestMsg);
    let buffer = Buffer.from(mintRequestBase64, "base64");
    //let uint8Array = new Uint8Array(buffer);

    const signature = await signerPrivateKey.sign(buffer);
    const sigBase64 = toBase64(signature);

    console.log("Tx: ");
    console.log(mintRequestMsg);
    console.log();
    console.log("Signature: " + sigBase64);
    console.log();
    console.log("Address: " + signerAddress);
    console.log();


    const checkSigQueryResponse = await chainGrpcWasmApi.fetchSmartContractState(
        MINTER_ADDRESS,
        toBase64({
            // check_sig: {
            //     //mint_request: mintRequestBase64,
            //     signature: sigBase64,
            //     //maybe_signer: null,
            // }
            check_sig: {
                maybe_signer: null,
                mint_request: mintRequestMsg,
                signature: sigBase64,
            }

        } as DegaMinterQueryMsg),
    );

    const checkSigQueryResponseObject: object = fromBase64(
        Buffer.from(checkSigQueryResponse.data).toString("base64")
    );

    console.log(checkSigQueryResponseObject);
}

async function compileFile(
    schemaFilePath: string,
    outputTsFilePath: string,
    typeName: string,
) {
    const schemaInput = new JSONSchemaInput(new FetchingJSONSchemaStore());

    await schemaInput.addSource({
        name: typeName,
        schema: fs.readFileSync(path.resolve(__dirname, schemaFilePath), 'utf8')
    });

    const inputData = new InputData();
    inputData.addInput(schemaInput);

    const compileResults =
        await quicktype({
            inputData,
            lang: "typescript"
        });

    let hadError = false;
    for (const sa of compileResults.annotations) {
        const annotation = sa.annotation;
        if (!(annotation instanceof IssueAnnotationData)) continue;
        const lineNumber = sa.span.start.line;
        const humanLineNumber = lineNumber + 1;
        console.error(`\nIssue in line ${humanLineNumber}: ${annotation.message}`);
        console.error(`${humanLineNumber}: ${compileResults.lines[lineNumber]}`);
        hadError = true;
    }

    if (hadError) {
        throw new Error("Error in quicktype");
    } else {
        fs.writeFileSync(path.resolve(__dirname, outputTsFilePath), compileResults.lines.join("\n"));
    }

    inputData.addInput(schemaInput);
}

async function generateMessagesTs() {

    const messagesDir = path.resolve(__dirname, "../messages");
    if (!fs.existsSync(messagesDir)){
        fs.mkdirSync(messagesDir);
    }

    // Dega Minter Messages to Typescript
    await compileFile(
        "../../contracts/dega-minter/schema/instantiate_msg.json",
        "../messages/dega_minter_instantiate.ts",
        "DegaMinterInstantiateMsg",
    );

    await compileFile(
        "../../contracts/dega-minter/schema/execute_msg.json",
        "../messages/dega_minter_execute.ts",
        "DegaMinterExecuteMsg",
    );

    await compileFile(
        "../../contracts/dega-minter/schema/query_msg.json",
        "../messages/dega_minter_query.ts",
        "DegaMinterQueryMsg",
    );


    // Dega CW721 Messages to Typescript
    await compileFile(
        "../../contracts/dega-cw721/schema/instantiate_msg.json",
        "../messages/dega_cw721_instantiate.ts",
        "DegaCw721InstantiateMsg",
    );

    await compileFile(
        "../../contracts/dega-cw721/schema/execute_msg.json",
        "../messages/dega_cw721_execute.ts",
        "DegaCw721ExecuteMsg",
    );

    await compileFile(
        "../../contracts/dega-cw721/schema/query_msg.json",
        "../messages/dega_cw721_query.ts",
        "DegaCw721QueryMsg",
    );
}


function main() {
    (async () => {

        //await query();
        await signerTest();
        //await generateMessagesTs();

    })();
}

main();
