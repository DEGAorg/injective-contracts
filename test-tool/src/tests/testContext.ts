import {MsgBroadcasterWithPk, PrivateKey} from "@injectivelabs/sdk-ts";
import {Network} from "@injectivelabs/networks";
import {ChainId} from "@injectivelabs/ts-types";
import secp256k1 from "secp256k1";
import {Config, generatePrivateKey, inDeployment, isJestRunning, reloadConfig} from "../config";
import fs from "fs";
import path from "node:path";

export interface TestContext {
    testPrivateKeyOne: PrivateKey;
    testAddressOne: string;
    testPrivateKeyTwo: PrivateKey;
    testAddressTwo: string;
    testPrivateKeyThree: PrivateKey;
    testAddressThree: string;
    testMinterWasmChecksum: string,
    testCw721WasmChecksum: string,
    localGenesisPrivateKey: PrivateKey,
    localGenesisAddress: string,
    localGenesisBroadcaster: MsgBroadcasterWithPk,
}

function validateChecksum(hash: string) {
    let buffer = Buffer.from(hash, 'hex');
    if (buffer.length != 32) {
        throw new Error("Invalid hash length");
    }
}


async function initTestContext(): Promise<TestContext> {

    // We need to reload the config because the statically loaded Config object
    // doesn't have the values from the .env.test we just dynamically loaded
    const config = reloadConfig();

    if (!config.LOCAL_GENESIS_MNEMONIC) {
        throw new Error("LOCAL_GENESIS_MNEMONIC must be set for integration testing");
    }

    const localGenesisPrivateKey = PrivateKey.fromMnemonic(config.LOCAL_GENESIS_MNEMONIC);

    const localGenesisAddress = localGenesisPrivateKey.toBech32();

    const localGenesisBroadcaster = new MsgBroadcasterWithPk({
                privateKey: localGenesisPrivateKey, /** private key hash or PrivateKey class from sdk-ts */
                network: Network.Local,
            });

    localGenesisBroadcaster.chainId = ChainId.Mainnet; // Fix for local testnet chain ID being wrong for Local in the injective typescript library

    const testPrivateKeyOne = PrivateKey.fromHex(config.TEST_TEST_ONE_SEEDHEX);
    const testAddressOne = testPrivateKeyOne.toBech32();

    const testPrivateKeyTwo = PrivateKey.fromHex(config.TEST_TEST_TWO_SEEDHEX);
    const testAddressTwo = testPrivateKeyTwo.toBech32();

    const testPrivateKeyThree = PrivateKey.fromHex(config.TEST_TEST_THREE_SEEDHEX);
    const testAddressThree = testPrivateKeyThree.toBech32();

    const deploymentVar = process.env.DEPLOYMENT;

    let testMinterWasmChecksum;
    let testCw721WasmChecksum;

    const checksumsTxtPath = path.resolve(__dirname, "..", "..", "..", "artifacts-optimized", "checksums.txt")

    if (inDeployment()) {

        // Define these as their own flag to avoid a collision and accidental usage of
        // local testing code ids during the running of the test suite during deployment
        // The flags below are what are used when running the test suite during deployment.
        testMinterWasmChecksum = process.env.TEST_MINTER_WASM_CHECKSUM;
        testCw721WasmChecksum = process.env.TEST_CW721_WASM_CHECKSUM;

        if (testMinterWasmChecksum == null || testMinterWasmChecksum == "" ||
            testCw721WasmChecksum == null || testCw721WasmChecksum == "") {
            throw new Error("TEST_MINTER_WASM_CHECKSUM and TEST_CW721_WASM_CHECKSUM must be set in the environment" +
                "when running integration tests in a deployment");
        }
    } else if (fs.existsSync(checksumsTxtPath)) {
        const checksumsTxtContents = fs.readFileSync(checksumsTxtPath, "utf-8");
        const checksumsTxtLines = checksumsTxtContents.split("\n");
        for (let line of checksumsTxtLines) {
            let parts = line.split(/\s+/);

            if (parts.length == 1) continue; // last line

            if (parts.length != 2) {
                throw new Error("Invalid line in checksums.txt with tokens: " + parts.length + " line: " + line);
            }

            const hashString = parts[0];
            let wasmName = parts[1];
            if (wasmName == "dega_minter.wasm") {
                testMinterWasmChecksum = hashString;
            } else if (wasmName == "dega_cw721.wasm") {
                testCw721WasmChecksum = hashString;
            } else {
                if (wasmName == "") {
                    wasmName = "<empty>";
                }
                throw new Error("Unknown wasm name in checksums.txt: " + wasmName);
            }
        }
    } else {
        throw new Error("artifacts-optimized/checksums.txt not found");
    }

    if (testMinterWasmChecksum == undefined || testCw721WasmChecksum == undefined) {
        throw new Error("Minter or CW721 wasm checksum not found");
    }

    validateChecksum(testMinterWasmChecksum);
    validateChecksum(testCw721WasmChecksum);

    return {
        testPrivateKeyOne,
        testAddressOne,
        testPrivateKeyTwo,
        testAddressTwo,
        testPrivateKeyThree,
        testAddressThree,
        testMinterWasmChecksum,
        testCw721WasmChecksum,
        localGenesisPrivateKey,
        localGenesisAddress,
        localGenesisBroadcaster,
    }
}

let testContext: TestContext | null = null;

export async function getTestContext(): Promise<TestContext> {

    if (!isJestRunning()) {
        throw new Error("Test Context may only be used during integration tests");
    }

    if (!testContext) {
        testContext = await initTestContext();
    }

    return testContext;
}