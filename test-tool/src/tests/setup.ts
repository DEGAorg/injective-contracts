import {BigNumberInBase, BigNumberInWei} from "@injectivelabs/utils";
import {DegaMinterExecuteMsg, MintRequest} from "../messages/dega_minter_execute";
import {contextSetCodeIds, contextSetContractAddresses, getAppContext} from "../context";
import {v4 as uuidv4} from "uuid";
import {
    ChainGrpcBankApi, ChainGrpcWasmApi,
    fromBase64,
    MsgBroadcasterWithPk,
    MsgExecuteContractCompat, MsgInstantiateContract, MsgSend, PaginationOption,
    PrivateKey,
    sha256,
    toBase64
} from "@injectivelabs/sdk-ts";
import secp256k1 from "secp256k1";
import {DegaMinterInstantiateMsg, DegaMinterQueryMsg} from "../messages";
import {SignerSourceTypeEnum} from "../messages/dega_minter_query";
import {Config, generatePrivateKeySeedHex} from "../config";
import {getNetworkEndpoints, Network} from "@injectivelabs/networks";
import { randomBytes } from "crypto"
import {ChainId} from "@injectivelabs/ts-types";
import {instantiateMinter, instantiateReceiver, store_wasm, stripQuotes, TxAttribute, TxEvent} from "../tx";
import {ChainGrpcTendermintApi} from "@injectivelabs/sdk-ts/dist/cjs/client/chain/grpc/ChainGrpcTendermintApi";
import {getTestContext} from "./testContext";
import fs from "fs";
import path from "node:path";
import * as util from "util";

async function addMsgForFillingTestAddress(addressToFill: string, balanceRequiredINJ: number, msgArray: MsgSend[]) {

    console.log("Filling test wallet at address: " + addressToFill + " with " + balanceRequiredINJ + " INJ");

    const testContext = await getTestContext();
    const balanceRequiredInBase = new BigNumberInBase(balanceRequiredINJ);
    const balanceRequiredInWei = balanceRequiredInBase.toWei();

    const appContext = await getAppContext();

    const existingBalance = await appContext.queryBankApi.fetchBalance({
        accountAddress: addressToFill,
        denom: "inj"
    });


    const existingBalanceInWei = new BigNumberInWei(existingBalance.amount);

    if (existingBalanceInWei.gte(balanceRequiredInWei)) {
        return msgArray;
    }

    const amountToFillInWei: BigNumberInWei = balanceRequiredInWei.minus(existingBalanceInWei);

    msgArray.push(MsgSend.fromJSON({
        srcInjectiveAddress: testContext.localGenesisAddress,
        dstInjectiveAddress: addressToFill,
        amount: {
            denom: "inj",
            amount: amountToFillInWei.toFixed()
        }
    }));



    return msgArray;
}


export async function findCodeIdsFromChecksums(): Promise<[number, number, number | undefined]> {

    const testContext = await getTestContext();
    const appContext = await getAppContext();

    const paginationOptions: PaginationOption = {
        reverse: true,
        limit: 50,
    };

    let minterCodeId: number | undefined = undefined;
    let cw721CodeId: number | undefined = undefined;
    let receiverTesterCodeId: number | undefined = undefined;
    const contractCodes = await appContext.queryWasmApi.fetchContractCodes(paginationOptions);

    console.log("Fetched contract codes to find minter and cw721 code ids.");
    console.log("Codes fetched: " + contractCodes.codeInfosList.length);

    console.log("Searching for code checksums");
    console.log("Minter checksum: " + testContext.testMinterWasmChecksum);
    console.log("CW721 checksum: " + testContext.testCw721WasmChecksum);
    console.log("Receiver tester checksum: " + (testContext.testReceiverTesterWasmChecksum ? testContext.testReceiverTesterWasmChecksum : "Not provided"));

    for (let contractCode of contractCodes.codeInfosList) {
        let wasmChecksum = contractCode.dataHash;
        if (wasmChecksum instanceof Uint8Array) {
            wasmChecksum = Buffer.from(contractCode.dataHash).toString("hex");
        }

        console.log("Searching code id: " + contractCode.codeId + " checksum: " + wasmChecksum);

        if (minterCodeId == undefined && wasmChecksum == testContext.testMinterWasmChecksum) {
            // Capture the first minter code-id found
            minterCodeId = contractCode.codeId;
            console.log("Found minter code id: " + minterCodeId);
        }

        if (cw721CodeId == undefined && wasmChecksum == testContext.testCw721WasmChecksum) {
            // Capture the first cw721 code-id found
            cw721CodeId = contractCode.codeId;
            console.log("Found cw721 code id: " + cw721CodeId);
        }

        if (receiverTesterCodeId == undefined && wasmChecksum == testContext.testReceiverTesterWasmChecksum) {
            // Capture the first receiver tester code-id found
            receiverTesterCodeId = contractCode.codeId;
            console.log("Found receiver tester code id: " + receiverTesterCodeId);
        }

        let foundRecieverOrNotSearchingForIt = receiverTesterCodeId != undefined || testContext.testReceiverTesterWasmChecksum == undefined;

        if (minterCodeId != undefined && cw721CodeId != undefined && foundRecieverOrNotSearchingForIt) {
            // Found both dega code id's and the receiver code id if we were searching for it, can stop searching
            break;
        }
    }

    if (minterCodeId == undefined) {
        minterCodeId = await store_wasm("dega_minter.wasm")
    }

    if (cw721CodeId == undefined) {
        cw721CodeId = await store_wasm("dega_cw721.wasm")
    }

    if (receiverTesterCodeId == undefined && testContext.testReceiverTesterWasmChecksum != undefined) {

        let isCorrectWasmCopiedToArtifacts = false;
        let targetWasmPath = path.join(__dirname, "..", "..", "..", "artifacts-optimized", "cw721_receiver_tester.wasm");
        if (fs.existsSync(targetWasmPath)) {
            let artifactsWasmChecksum = Buffer.from(sha256(fs.readFileSync(targetWasmPath))).toString("hex");
            if (artifactsWasmChecksum == testContext.testReceiverTesterWasmChecksum) {
                isCorrectWasmCopiedToArtifacts = true;
            }
        }

        let sourceWasmPath = path.resolve(__dirname, "..", "..", "data", "cw721_receiver_tester.wasm");
        if (!isCorrectWasmCopiedToArtifacts && fs.existsSync(sourceWasmPath)) {
            let artifactsWasmChecksum = Buffer.from(sha256(fs.readFileSync(sourceWasmPath))).toString("hex");
            if (artifactsWasmChecksum == testContext.testReceiverTesterWasmChecksum) {
                fs.copyFileSync(sourceWasmPath, targetWasmPath);
            }
        }

    }

    return [minterCodeId, cw721CodeId, receiverTesterCodeId];
}

async function fillTestWallets() {

    console.log("Filling test wallets");

    const testContext = await getTestContext();
    const appContext = await getAppContext();
    let sendMessages: MsgSend[] = [];

    sendMessages = await addMsgForFillingTestAddress(appContext.primaryAddress, 10, sendMessages);
    sendMessages = await addMsgForFillingTestAddress(appContext.signerAddress, 1, sendMessages);
    sendMessages = await addMsgForFillingTestAddress(testContext.testAddressOne, 1, sendMessages);
    sendMessages = await addMsgForFillingTestAddress(testContext.testAddressTwo, 1, sendMessages);
    sendMessages = await addMsgForFillingTestAddress(testContext.testAddressThree, 1, sendMessages);

    await testContext.localGenesisBroadcaster.broadcast({
        msgs: sendMessages,
        gas: appContext.gasSettings
    });
}


async function createInstantiateMsg() {

    const appContext = await getAppContext();
    const testContext = await getTestContext();

    const instantiateMinterMsg: DegaMinterInstantiateMsg = {
        collection_params: {
            code_id: appContext.cw721CodeId,
            info: {
                description: "A simple test collection description",
                image: "https://storage.googleapis.com/dega-banner/banner.png"
            },
            name: "Test Collection",
            symbol: "TEST"
        },
        minter_params: {
            dega_minter_settings: {
                signer_pub_key: appContext.signerCompressedPublicKey.toString("base64"),
                minting_paused: false
            },
            initial_admin: appContext.primaryAddress,
        },
        cw721_contract_label: "DEGA Collection - Test Collection",
        cw721_contract_admin: appContext.primaryAddress
    };

    const instantiateMsg = MsgInstantiateContract.fromJSON({
        sender: appContext.primaryAddress,
        admin: appContext.primaryAddress,
        codeId: appContext.minterCodeId,
        label: "DEGA Minter - Test Collection",
        msg: instantiateMinterMsg,
    });

    console.log("Instantiate Message:")
    logObjectFullDepth(instantiateMsg);

    return instantiateMsg;
}

export function logObjectFullDepth(obj: any) {
    console.log(util.inspect(obj, {showHidden: false, depth: null, colors: true}));
}

function generateTestEnvFile() {

    const testEnvFilePath = path.resolve(__dirname, "..", "..", "cache", ".env.test");

    fs.writeFileSync(testEnvFilePath, "");

    appendTestEnvFile("TEST_PRIMARY_SEEDHEX=" + generatePrivateKeySeedHex());
    appendTestEnvFile("TEST_SIGNER_SEEDHEX=" + generatePrivateKeySeedHex());
    appendTestEnvFile("TEST_TEST_ONE_SEEDHEX=" + generatePrivateKeySeedHex());
    appendTestEnvFile("TEST_TEST_TWO_SEEDHEX=" + generatePrivateKeySeedHex());
    appendTestEnvFile("TEST_TEST_THREE_SEEDHEX=" + generatePrivateKeySeedHex());
}

function appendTestEnvFile(line: string) {
    const testEnvFilePath = path.resolve(__dirname, "..", "..", "cache", ".env.test");
    fs.appendFileSync(testEnvFilePath, line + "\n");
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Integration testing setup function called once before all tests are run
export default async function setup() {

    //console.log = function() {}


    console.log("Setting up test environment");

    console.log("Generating test keys")

    generateTestEnvFile();
    await sleep(2000); // Wait for file to be written

    const hasGenesisMnemonic = Config.LOCAL_GENESIS_MNEMONIC != undefined && Config.LOCAL_GENESIS_MNEMONIC != "";

    if (!hasGenesisMnemonic) {
        throw new Error("Integration tests require a local genesis mnemonic to source test tokens from")
    }

    const testContext = await getTestContext();
    const appContext = await getAppContext();


    console.log("Primary address (generated): " + appContext.primaryAddress);
    console.log("Signer address (generated): " + appContext.signerAddress);
    console.log("Signer compressed public key (generated): " + appContext.signerCompressedPublicKey.toString("base64"));
    console.log("Test address one (generated): " + testContext.testAddressOne);
    console.log("Test address two (generated): " + testContext.testAddressTwo);
    console.log("Test address three (generated): " + testContext.testAddressThree);
    console.log("Local genesis address: " + appContext.localGenesisAddress);

    try {
        await appContext.queryTendermintApi.fetchLatestBlock();
    } catch (e) {
        throw new Error("Must turn on Injective Localnet with 'injectived start' before running integration tests")
    }

    await fillTestWallets();

    const [minterCodeId, cw721CodeId, receiverCodeId] = await findCodeIdsFromChecksums();

    if (receiverCodeId == undefined) {
        throw new Error("Receiver code id not found")
    }

    console.log("Minter code-id detected: " + minterCodeId);
    console.log("Collection code-id detected: " + cw721CodeId);
    console.log("Receiver code-id detected: " + receiverCodeId);

    contextSetCodeIds(minterCodeId, cw721CodeId, receiverCodeId);
    appendTestEnvFile("TEST_MINTER_CODE_ID=" + minterCodeId);
    appendTestEnvFile("TEST_CW721_CODE_ID=" + cw721CodeId);
    appendTestEnvFile("TEST_RECEIVER_CODE_ID=" + receiverCodeId);

    const [instantiateResponse, minterAddress, cw721Address] =
        await instantiateMinter(await createInstantiateMsg());

    const [receiverInstantiateResponse, receiverAddress] = await instantiateReceiver(false);

    contextSetContractAddresses(minterAddress, cw721Address, receiverAddress);
    appendTestEnvFile("TEST_MINTER_ADDRESS=" + minterAddress);
    appendTestEnvFile("TEST_CW721_ADDRESS=" + cw721Address);
    appendTestEnvFile("TEST_RECEIVER_ADDRESS=" + receiverAddress);

    await sleep(2000); // Wait for file to be written

    console.log("Minter contract instantiated at: " + minterAddress);
    console.log("Collection contract instantiated at: " + cw721Address);
    console.log("Receiver contract instantiated at: " + receiverAddress);

    console.log("Setup complete");
};



