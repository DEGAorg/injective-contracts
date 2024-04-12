import {config} from "dotenv";
import {Network} from "@injectivelabs/networks";
import fs from 'fs';
import path from 'path';

function isEmpty(value: any) {
    return value === null || value === undefined;
}
function notEmpty(value: any) {
    return value !== null && value !== undefined;
}

function getContractAddressesFromWasmDeployConfig(useLocal: boolean)
    : { minterCodeId: any, minterAddress: any, cw721CodeId: any, cw721Address: any } | null
{

    // Resolve the path to the JSON file
    const jsonFilePath = path.resolve(__dirname, '../../.wasm-deploy/config.json');

    // Read the JSON file
    const jsonData = fs.readFileSync(jsonFilePath, 'utf-8');

    // Parse the JSON file into an object
    const jsonObject = JSON.parse(jsonData);

    // Get the env_id from the config
    const envId = useLocal ? process.env.CONFIG_LOCAL_ENV : process.env.CONFIG_TESTNET_ENV;

    if (isEmpty(jsonObject) || process.env.USE_WASM_DEPLOY_CONFIG as string != "true") return null;

    const envs = jsonObject["envs"] as any[];
    if (isEmpty(envs)) return null;

    const envObject = envs.find(env => env["env_id"] === envId);
    if (isEmpty(envObject)) return null;

    const contracts = envObject["contracts"] as any[];
    if (isEmpty(contracts)) return null;

    let minterCodeId = null;
    let minterAddress = null;
    const minterContract = contracts.find(contract => contract["name"] === 'dega-minter');
    if (notEmpty(minterContract)) {
        minterCodeId = minterContract["code_id"];
        minterAddress = minterContract["addr"];
    }

    let cw721CodeId = null;
    let cw721Address = null;
    const cw721Contract = contracts.find(contract => contract["name"] === 'dega-cw721');
    if (cw721Contract) {
        cw721CodeId = cw721Contract["code_id"];
        cw721Address = cw721Contract["addr"];
    }

    return {
        minterCodeId: minterCodeId,
        minterAddress: minterAddress,
        cw721CodeId: cw721CodeId,
        cw721Address: cw721Address,
    }
}

function initConfig() {

    config();

    let useLocal = process.env.USE_LOCAL as string == "true";

    let minterCodeId = 0;
    let minterAddress = (useLocal ? process.env.MINTER_ADDRESS_LOCAL : process.env.MINTER_ADDRESS) as string
    let cw721CodeId = 0;
    let cw721Address = (useLocal ? process.env.CW721_ADDRESS_LOCAL : process.env.CW721_ADDRESS) as string

    let minterAndCw721CodeIdsAddressesOrNull =
        getContractAddressesFromWasmDeployConfig(useLocal) as
            { minterCodeId: number, minterAddress: string, cw721CodeId: number, cw721Address: string };

    if (notEmpty(minterAndCw721CodeIdsAddressesOrNull)) {
        const minterCodeIdNumber = minterAndCw721CodeIdsAddressesOrNull.minterCodeId as number;
        if (notEmpty(minterCodeIdNumber)) {
            minterCodeId = minterCodeIdNumber;
        }
        const minterAddressString = minterAndCw721CodeIdsAddressesOrNull.minterAddress as string;
        if (notEmpty(minterAddressString) && minterAddressString.length > 0) {
            minterAddress = minterAddressString;
        }
        const cw721CodeIdNumber = minterAndCw721CodeIdsAddressesOrNull.cw721CodeId as number;
        if (notEmpty(cw721CodeIdNumber)) {
            cw721CodeId = cw721CodeIdNumber;
        }
        const cw721AddressString = minterAndCw721CodeIdsAddressesOrNull.cw721Address as string;
        if (notEmpty(cw721AddressString) && cw721AddressString.length > 0) {
            cw721Address = cw721AddressString;
        }
    }

    const useWasmDeployConfig = process.env.USE_WASM_DEPLOY_CONFIG as string == "true";

    return {
        USE_WASM_DEPLOY_CONFIG: useWasmDeployConfig as boolean,
        CONFIG_LOCAL_ENV: process.env.CONFIG_LOCAL_ENV as string,
        CONFIG_TESTNET_ENV: process.env.CONFIG_TESTNET_ENV as string,
        PRIVATE_KEY_MNEMONIC: process.env.PRIVATE_KEY_MNEMONIC as string,
        USE_LOCAL: useLocal,
        NETWORK: useLocal ? Network.Local : Network.Testnet,
        MINTER_CODE_ID: minterCodeId,
        MINTER_ADDRESS: minterAddress,
        CW721_CODE_ID: cw721CodeId,
        CW721_ADDRESS: cw721Address,
        SIGNER_KEY_MNEMONIC: process.env.SIGNER_KEY_MNEMONIC as string,
        LOCAL_GENESIS_MNEMONIC: process.env.LOCAL_GENESIS_MNEMONIC as string,
        INJECTIVED_PASSWORD: process.env.INJECTIVED_PASSWORD as string,
    }
}

export const Config = initConfig();