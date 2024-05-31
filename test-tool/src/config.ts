import {config} from "dotenv";
import path from "node:path";
import {randomBytes} from "crypto";
import {PrivateKey} from "@injectivelabs/sdk-ts";
import fs from "fs";

function isEmpty(value: any) {
    return value === null || value === undefined;
}
function notEmpty(value: any) {
    return value !== null && value !== undefined;
}

export function isJestRunning() {
    return process.env.NODE_ENV == "test";
}

export function inDeployment() {
    return process.env.DEPLOYMENT !== undefined;
}

export function generatePrivateKeySeedHex() {
    return "0x" + randomBytes(32).toString("hex");
}

export function generatePrivateKey() {
    return PrivateKey.fromHex(generatePrivateKeySeedHex());
}

function initConfig() {

    config();

    if (isJestRunning()) {
        const testEnvPath = path.resolve(__dirname, "..", "cache", ".env.test");

        if (fs.existsSync(testEnvPath)) {
            config({path: testEnvPath, override: true});
        }
    }

    let networkType: "Local" | "Testnet" | "Mainnet";

    const networkString = process.env.NETWORK;

    if (networkString != "Local" && networkString != "Testnet" && networkString != "Mainnet") {
        if (networkString) {
            throw new Error("Invalid NETWORK defined in environment: " + networkString);
        }

        networkType = "Testnet"; // Default to Local
    } else {
        networkType = networkString as "Local" | "Testnet" | "Mainnet";
    }

    if (isJestRunning() && networkType != "Local") {
        networkType = "Local";
    }

    if (!process.env.PRIVATE_KEY_MNEMONIC && !isJestRunning()) {
        throw new Error("PRIVATE_KEY_MNEMONIC must be defined in the environment");
    }

    if (!process.env.SIGNER_KEY_MNEMONIC && !isJestRunning()) {
        throw new Error("SIGNER_KEY_MNEMONIC must be defined in the environment");
    }

    if (isJestRunning() && !process.env.LOCAL_GENESIS_MNEMONIC) {
        throw new Error("LOCAL_GENESIS_MNEMONIC must be defined in the environment when running integration tests");
    }

    return {
        PRIVATE_KEY_MNEMONIC: process.env.PRIVATE_KEY_MNEMONIC ?? "",
        SIGNER_KEY_MNEMONIC: process.env.SIGNER_KEY_MNEMONIC ?? "",
        LOCAL_GENESIS_MNEMONIC: process.env.LOCAL_GENESIS_MNEMONIC ?? "",
        INJECTIVED_PASSWORD: process.env.INJECTIVED_PASSWORD ?? "",
        NETWORK: networkType,
        MINTER_CODE_ID_LOCAL: process.env.MINTER_CODE_ID_LOCAL ?? "",
        CW721_CODE_ID_LOCAL: process.env.CW721_CODE_ID_LOCAL ?? "",
        RECEIVER_CODE_ID_LOCAL: process.env.RECEIVER_CODE_ID_LOCAL ?? "",
        MINTER_ADDRESS_LOCAL: process.env.MINTER_ADDRESS_LOCAL ?? "",
        CW721_ADDRESS_LOCAL: process.env.CW721_ADDRESS_LOCAL ?? "",
        RECEIVER_ADDRESS_LOCAL: process.env.RECEIVER_ADDRESS_LOCAL ?? "",
        MINTER_CODE_ID_TESTNET: process.env.MINTER_CODE_ID_TESTNET ?? "",
        CW721_CODE_ID_TESTNET: process.env.CW721_CODE_ID_TESTNET ?? "",
        RECEIVER_CODE_ID_TESTNET: process.env.RECEIVER_CODE_ID_TESTNET ?? "",
        MINTER_ADDRESS_TESTNET: process.env.MINTER_ADDRESS_TESTNET ?? "",
        CW721_ADDRESS_TESTNET: process.env.CW721_ADDRESS_TESTNET ?? "",
        RECEIVER_ADDRESS_TESTNET: process.env.RECEIVER_ADDRESS_TESTNET ?? "",
        MINTER_CODE_ID_MAINNET: process.env.MINTER_CODE_ID_MAINNET ?? "",
        CW721_CODE_ID_MAINNET: process.env.CW721_CODE_ID_MAINNET ?? "",
        MINTER_ADDRESS_MAINNET: process.env.MINTER_ADDRESS_MAINNET ?? "",
        CW721_ADDRESS_MAINNET: process.env.CW721_ADDRESS_MAINNET ?? "",
        TEST_PRIMARY_SEEDHEX: process.env.TEST_PRIMARY_SEEDHEX ?? "",
        TEST_SIGNER_SEEDHEX: process.env.TEST_SIGNER_SEEDHEX ?? "",
        TEST_SIGNER_TWO_SEEDHEX: process.env.TEST_SIGNER_TWO_SEEDHEX ?? "",
        TEST_TEST_ONE_SEEDHEX: process.env.TEST_TEST_ONE_SEEDHEX ?? "",
        TEST_TEST_TWO_SEEDHEX: process.env.TEST_TEST_TWO_SEEDHEX ?? "",
        TEST_TEST_THREE_SEEDHEX: process.env.TEST_TEST_THREE_SEEDHEX ?? "",
        TEST_MINTER_CODE_ID: process.env.TEST_MINTER_CODE_ID ?? "",
        TEST_CW721_CODE_ID: process.env.TEST_CW721_CODE_ID ?? "",
        TEST_RECEIVER_CODE_ID: process.env.TEST_RECEIVER_CODE_ID ?? "",
        TEST_MINTER_ADDRESS: process.env.TEST_MINTER_ADDRESS ?? "",
        TEST_CW721_ADDRESS: process.env.TEST_CW721_ADDRESS ?? "",
        TEST_RECEIVER_ADDRESS: process.env.TEST_RECEIVER_ADDRESS ?? "",
    }
}

export const Config = initConfig();

// Used in testing when we have procedurally generated the config but need
// to access the values we just generated
export function reloadConfig() {
    return initConfig();
}

