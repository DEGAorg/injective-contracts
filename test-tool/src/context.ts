import {getNetworkEndpoints} from "@injectivelabs/networks";
import {ChainGrpcBankApi, ChainGrpcWasmApi, MsgBroadcasterWithPk, PrivateKey} from "@injectivelabs/sdk-ts";
import {Config} from "./config";
import {BigNumberInBase} from "@injectivelabs/utils";
import {ChainId} from "@injectivelabs/ts-types";

function initContext() {

    const primaryPrivateKey = PrivateKey.fromMnemonic(Config.PRIVATE_KEY_MNEMONIC);
    const primaryAddress = primaryPrivateKey.toBech32();

    const signerPrivateKey = PrivateKey.fromMnemonic(Config.SIGNER_KEY_MNEMONIC);
    const signerAddress = signerPrivateKey.toBech32();

    const localGenesisPrivateKey = PrivateKey.fromMnemonic(Config.LOCAL_GENESIS_MNEMONIC);
    const localGenesisAddress = localGenesisPrivateKey.toBech32();

    const endpoints = getNetworkEndpoints(Config.NETWORK);
    const chainGrpcBankApi = new ChainGrpcBankApi(endpoints.grpc);
    const chainGrpcWasmApi = new ChainGrpcWasmApi(endpoints.grpc);

    const netTest = Config.NETWORK;
    const optionsTest = {
        privateKey: primaryPrivateKey, /** private key hash or PrivateKey class from sdk-ts */
        network: netTest,
    };

    const primaryBroadcaster = new MsgBroadcasterWithPk({
        privateKey: primaryPrivateKey, /** private key hash or PrivateKey class from sdk-ts */
        network: Config.NETWORK,
    })
    if (Config.USE_LOCAL) {
        primaryBroadcaster.chainId = ChainId.Mainnet
    }

    const signerBroadcaster = new MsgBroadcasterWithPk({
        privateKey: signerPrivateKey, /** private key hash or PrivateKey class from sdk-ts */
        network: Config.NETWORK,
    })
    if (Config.USE_LOCAL) {
        signerBroadcaster.chainId = ChainId.Mainnet
    }

    const localGenesisBroadcaster = new MsgBroadcasterWithPk({
        privateKey: localGenesisPrivateKey, /** private key hash or PrivateKey class from sdk-ts */
        network: Config.NETWORK,
    })
    if (Config.USE_LOCAL) {
        localGenesisBroadcaster.chainId = ChainId.Mainnet
    }


    const gasPricesAmountWei = new BigNumberInBase(500000000);
    const gasAmountWei = new BigNumberInBase(20000000);

    const gasSettings = {
        gasPrice: gasPricesAmountWei.toFixed(),
        gas: gasAmountWei.toNumber(),
    }

    return {
        primaryPrivateKey: primaryPrivateKey,
        primaryAddress: primaryAddress,
        signerPrivateKey: signerPrivateKey,
        signerAddress: signerAddress,
        localGenesisPrivateKey: localGenesisPrivateKey,
        localGenesisAddress: localGenesisAddress,
        endpoints: endpoints,
        chainGrpcBankApi: chainGrpcBankApi,
        chainGrpcWasmApi: chainGrpcWasmApi,
        primaryBroadcaster: primaryBroadcaster,
        signerBroadcaster: signerBroadcaster,
        localGenesisBroadcaster: localGenesisBroadcaster,
        gasPricesAmountWei: gasPricesAmountWei,
        gasAmountWei: gasAmountWei,
        gasSettings: gasSettings
    }
}

export const Context = initContext();