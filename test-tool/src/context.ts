import {getNetworkEndpoints, Network} from "@injectivelabs/networks";
import {
    ChainGrpcAuthApi,
    ChainGrpcBankApi,
    ChainGrpcWasmApi,
    hexToBase64,
    MsgBroadcasterWithPk,
    PrivateKey
} from "@injectivelabs/sdk-ts";
import {Config, generatePrivateKey, generatePrivateKeySeedHex, isJestRunning, reloadConfig} from "./config";
import {BigNumberInWei} from "@injectivelabs/utils";
import {ChainId} from "@injectivelabs/ts-types";
import secp256k1 from "secp256k1"
import {getTestContext} from "./tests/testContext";
import {ChainGrpcTendermintApi} from "@injectivelabs/sdk-ts/dist/cjs/client/chain/grpc/ChainGrpcTendermintApi";

export interface AppContext {
    primaryPrivateKey: PrivateKey;
    primaryAddress: string;
    signerPrivateKey: PrivateKey;
    signerSigningKey: Buffer;
    signerCompressedPublicKey: Buffer;
    signerAddress: string;
    localGenesisPrivateKey: PrivateKey | undefined;
    localGenesisAddress: string | undefined;
    endpoints: any;
    queryBankApi: ChainGrpcBankApi;
    queryWasmApi: ChainGrpcWasmApi;
    queryAuthApi: ChainGrpcAuthApi;
    queryTendermintApi: ChainGrpcTendermintApi;
    primaryBroadcaster: MsgBroadcasterWithPk;
    signerBroadcaster: MsgBroadcasterWithPk;
    localGenesisBroadcaster: MsgBroadcasterWithPk | undefined;
    gasPricesAmountWei: BigNumberInWei;
    gasAmountWei: BigNumberInWei;
    gasSettings: any;
    minterCodeId: number;
    cw721CodeId: number;
    receiverCodeId: number | undefined;
    minterAddress: string;
    cw721Address: string;
    receiverContractAddress: string | undefined;
}

// Run before each integration test
async function initAppContext(): Promise<AppContext> {

    // We need to reload the config because the statically loaded Config object
    // doesn't have the values from the .env.test we just dynamically loaded
    const config = reloadConfig();

    if (config.PRIVATE_KEY_MNEMONIC == "") {
        throw new Error("PRIVATE_KEY_MNEMONIC is required");
    }

    let primaryPrivateKey =
        isJestRunning() ?
            PrivateKey.fromHex(config.TEST_PRIMARY_SEEDHEX) :
            PrivateKey.fromMnemonic(config.PRIVATE_KEY_MNEMONIC);

    const primaryAddress = primaryPrivateKey.toBech32();

    if (config.SIGNER_KEY_MNEMONIC == "") {
        throw new Error("SIGNER_KEY_MNEMONIC is required");
    }

    const signerPrivateKey =
        isJestRunning() ?
            PrivateKey.fromHex(config.TEST_SIGNER_SEEDHEX) :
            PrivateKey.fromMnemonic(config.SIGNER_KEY_MNEMONIC);

    const signerSigningKey = Buffer.from(signerPrivateKey.toPrivateKeyHex().slice(2), "hex");

    if (!secp256k1.privateKeyVerify(signerSigningKey)) {
        throw new Error("Invalid signer private key");
    }

    const signerCompressedPublicKey = Buffer.from(secp256k1.publicKeyCreate(signerSigningKey, true))
    const signerAddress = signerPrivateKey.toBech32();

    const hasGenesisMnemonic = config.LOCAL_GENESIS_MNEMONIC != undefined && config.LOCAL_GENESIS_MNEMONIC != "";

    const localGenesisPrivateKey =
        hasGenesisMnemonic ?
            PrivateKey.fromMnemonic(config.LOCAL_GENESIS_MNEMONIC) :
            undefined;

    const localGenesisAddress =
        (localGenesisPrivateKey != undefined) ?
            localGenesisPrivateKey.toBech32() :
            undefined;

    let network;

    switch (config.NETWORK) {
        case "Local":
            network = Network.Local;
            break;
        case "Testnet":
            network = Network.Testnet;
            break;
        case "Mainnet":
            network = Network.Mainnet;
            break;
    }

    const endpoints = getNetworkEndpoints(network);
    const queryBankApi = new ChainGrpcBankApi(endpoints.grpc);
    const queryWasmApi = new ChainGrpcWasmApi(endpoints.grpc);
    const queryAuthApi = new ChainGrpcAuthApi(endpoints.grpc);
    const queryTendermintApi = new ChainGrpcTendermintApi(endpoints.grpc);

    const netTest = config.NETWORK;
    const optionsTest = {
        privateKey: primaryPrivateKey, /** private key hash or PrivateKey class from sdk-ts */
        network: netTest,
    };

    const primaryBroadcaster = new MsgBroadcasterWithPk({
        privateKey: primaryPrivateKey, /** private key hash or PrivateKey class from sdk-ts */
        network: network,
    })
    if (config.NETWORK == "Local") {
        primaryBroadcaster.chainId = ChainId.Mainnet
    }

    const signerBroadcaster = new MsgBroadcasterWithPk({
        privateKey: signerPrivateKey, /** private key hash or PrivateKey class from sdk-ts */
        network: network,
    })
    if (config.NETWORK == "Local") {
        signerBroadcaster.chainId = ChainId.Mainnet
    }

    const localGenesisBroadcaster =
        (localGenesisPrivateKey != undefined)
            ?   (new MsgBroadcasterWithPk({
                    privateKey: localGenesisPrivateKey, /** private key hash or PrivateKey class from sdk-ts */
                    network: network,
                }))
            : undefined;

    if (config.NETWORK == "Local" && localGenesisBroadcaster != undefined) {
        localGenesisBroadcaster.chainId = ChainId.Mainnet
    }

    const gasPricesAmountWei = new BigNumberInWei(500000000);
    const gasAmountWei = new BigNumberInWei(20000000);

    const gasSettings = {
        gasPrice: gasPricesAmountWei.toFixed(),
        gas: gasAmountWei.toNumber(),
    }

    let minterCodeId: number;
    let cw721CodeId: number;
    let receiverCodeId: number | undefined;
    let minterAddress: string;
    let cw721Address: string;
    let receiverContractAddress: string | undefined;

    if (isJestRunning()) {

        if (config.TEST_MINTER_CODE_ID == undefined || config.TEST_CW721_CODE_ID == undefined || config.TEST_RECEIVER_CODE_ID == undefined ||
            config.TEST_MINTER_ADDRESS == undefined || config.TEST_CW721_ADDRESS == undefined || config.TEST_RECEIVER_ADDRESS == undefined) {
            throw new Error("TEST_MINTER_CODE_ID, TEST_CW721_CODE_ID, TEST_RECEIVER_CODE_ID, TEST_MINTER_ADDRESS, TEST_CW721_ADDRESS, " +
                "and TEST_RECEIVER_ADDRESS must be defined for Jest environment");
        }
        minterCodeId = parseInt(config.TEST_MINTER_CODE_ID);
        cw721CodeId = parseInt(config.TEST_CW721_CODE_ID);
        receiverCodeId = parseInt(config.TEST_RECEIVER_CODE_ID);
        minterAddress = config.TEST_MINTER_ADDRESS;
        cw721Address = config.TEST_CW721_ADDRESS;
        receiverContractAddress = config.TEST_RECEIVER_ADDRESS;

    } else {
        switch (config.NETWORK) {
            case "Local":
                if (process.env.MINTER_CODE_ID_LOCAL == undefined || process.env.CW721_CODE_ID_LOCAL == undefined ||
                    process.env.MINTER_ADDRESS_LOCAL == undefined || process.env.CW721_ADDRESS_LOCAL == undefined) {
                    throw new Error("MINTER_CODE_ID_LOCAL, CW721_CODE_ID_LOCAL, MINTER_ADDRESS_LOCAL, and " +
                        "CW721_ADDRESS_LOCAL must be defined for Local environment");
                }
                minterCodeId = parseInt(process.env.MINTER_CODE_ID_LOCAL);
                cw721CodeId = parseInt(process.env.CW721_CODE_ID_LOCAL);
                receiverCodeId = process.env.RECEIVER_CODE_ID_LOCAL ? parseInt(process.env.RECEIVER_CODE_ID_LOCAL) : undefined;
                minterAddress = process.env.MINTER_ADDRESS_LOCAL;
                cw721Address = process.env.CW721_ADDRESS_LOCAL;
                receiverContractAddress = process.env.RECEIVER_ADDRESS_LOCAL;
                break;
            case "Testnet":
                if (process.env.MINTER_CODE_ID_TESTNET == undefined || process.env.CW721_CODE_ID_TESTNET == undefined ||
                    process.env.MINTER_ADDRESS_TESTNET == undefined || process.env.CW721_ADDRESS_TESTNET == undefined) {
                    throw new Error("MINTER_CODE_ID_TESTNET, CW721_CODE_ID_TESTNET, MINTER_ADDRESS_TESTNET, and " +
                        "CW721_ADDRESS_TESTNET must be defined for Testnet environment");
                }
                minterCodeId = parseInt(process.env.MINTER_CODE_ID_TESTNET);
                cw721CodeId = parseInt(process.env.CW721_CODE_ID_TESTNET);
                receiverCodeId = process.env.RECEIVER_CODE_ID_TESTNET ? parseInt(process.env.RECEIVER_CODE_ID_TESTNET) : undefined;
                minterAddress = process.env.MINTER_ADDRESS_TESTNET;
                cw721Address = process.env.CW721_ADDRESS_TESTNET;
                receiverContractAddress = process.env.RECEIVER_ADDRESS_TESTNET;
                break;
            case "Mainnet":
                if (process.env.MINTER_CODE_ID_MAINNET == undefined || process.env.CW721_CODE_ID_MAINNET == undefined ||
                    process.env.MINTER_ADDRESS_MAINNET == undefined || process.env.CW721_ADDRESS_MAINNET == undefined) {
                    throw new Error("MINTER_CODE_ID_MAINNET, CW721_CODE_ID_MAINNET, MINTER_ADDRESS_MAINNET, and " +
                        "CW721_ADDRESS_MAINNET must be defined for Mainnet environment");
                }
                minterCodeId = parseInt(process.env.MINTER_CODE_ID_MAINNET);
                cw721CodeId = parseInt(process.env.CW721_CODE_ID_MAINNET);
                receiverCodeId = 0;
                minterAddress = process.env.MINTER_ADDRESS_MAINNET;
                cw721Address = process.env.CW721_ADDRESS_MAINNET;
                receiverContractAddress = "";
                break;
        }
    }

    return {
        primaryPrivateKey: primaryPrivateKey,
        primaryAddress: primaryAddress,
        signerPrivateKey: signerPrivateKey,
        signerSigningKey: signerSigningKey,
        signerCompressedPublicKey: signerCompressedPublicKey,
        signerAddress: signerAddress,
        localGenesisPrivateKey: localGenesisPrivateKey,
        localGenesisAddress: localGenesisAddress,
        endpoints: endpoints,
        queryBankApi: queryBankApi,
        queryWasmApi: queryWasmApi,
        queryAuthApi: queryAuthApi,
        queryTendermintApi: queryTendermintApi,
        primaryBroadcaster: primaryBroadcaster,
        signerBroadcaster: signerBroadcaster,
        localGenesisBroadcaster: localGenesisBroadcaster,
        gasPricesAmountWei: gasPricesAmountWei,
        gasAmountWei: gasAmountWei,
        gasSettings: gasSettings,
        minterCodeId: minterCodeId,
        cw721CodeId: cw721CodeId,
        receiverCodeId: receiverCodeId,
        minterAddress: minterAddress,
        cw721Address: cw721Address,
        receiverContractAddress: receiverContractAddress,
    }
}

// Deprecated remove export when able (allowing support for later mutation of context object)
let context: AppContext | null = null;

export async function getAppContext(): Promise<AppContext> {
    if (!context) {
        context = await initAppContext();
    }

    return context;
}

export function contextSetCodeIds(minterCodeId: number, cw721CodeId: number, receiverCodeId: number) {
    if (context) {
        context.minterCodeId = minterCodeId;
        context.cw721CodeId = cw721CodeId;
        context.receiverCodeId = receiverCodeId;
    } else {
        throw new Error("Cannot set code ids without initializing context first");
    }
}

export function contextSetContractAddresses(minterAddress: string, cw721Address: string, receiverContractAddress: string) {
    if (context) {
        context.minterAddress = minterAddress;
        context.cw721Address = cw721Address;
        context.receiverContractAddress = receiverContractAddress;
    } else {
        throw new Error("Cannot set contract addresses without initializing context first");
    }
}
