import {getNetworkEndpoints} from "@injectivelabs/networks";
import {ChainGrpcBankApi, ChainGrpcWasmApi, hexToBase64, MsgBroadcasterWithPk, PrivateKey} from "@injectivelabs/sdk-ts";
import {Config} from "./config";
import {BigNumberInWei} from "@injectivelabs/utils";
import {ChainId} from "@injectivelabs/ts-types";
import secp256k1 from "secp256k1"

function initContext() {

    if (Config.PRIVATE_KEY_MNEMONIC == "") {
        throw new Error("PRIVATE_KEY_MNEMONIC is required");
    }

    const primaryPrivateKey = PrivateKey.fromMnemonic(Config.PRIVATE_KEY_MNEMONIC);
    const primaryAddress = primaryPrivateKey.toBech32();

    if (Config.SIGNER_KEY_MNEMONIC == "") {
        throw new Error("SIGNER_KEY_MNEMONIC is required");
    }

    const signerPrivateKey = PrivateKey.fromMnemonic(Config.SIGNER_KEY_MNEMONIC);
    const signerSigningKey = Buffer.from(signerPrivateKey.toPrivateKeyHex().slice(2), "hex");

    if (!secp256k1.privateKeyVerify(signerSigningKey)) {
        throw new Error("Invalid signer private key");
    }

    const signerCompressedPublicKey = Buffer.from(secp256k1.publicKeyCreate(signerSigningKey, true))
    const signerAddress = signerPrivateKey.toBech32();

    const hasGenesisMnemonic = Config.LOCAL_GENESIS_MNEMONIC == "";

    const localGenesisPrivateKey =
        hasGenesisMnemonic ?
            PrivateKey.fromMnemonic(Config.LOCAL_GENESIS_MNEMONIC) :
            undefined;

    const localGenesisAddress =
        (localGenesisPrivateKey != undefined) ?
            localGenesisPrivateKey.toBech32() :
            undefined;

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

    const localGenesisBroadcaster =
        (localGenesisPrivateKey != undefined)
            ?   (new MsgBroadcasterWithPk({
                    privateKey: localGenesisPrivateKey, /** private key hash or PrivateKey class from sdk-ts */
                    network: Config.NETWORK,
                }))
            : undefined;

    if (Config.USE_LOCAL && localGenesisBroadcaster != undefined) {
        localGenesisBroadcaster.chainId = ChainId.Mainnet
    }

    const gasPricesAmountWei = new BigNumberInWei(500000000);
    const gasAmountWei = new BigNumberInWei(20000000);

    const gasSettings = {
        gasPrice: gasPricesAmountWei.toFixed(),
        gas: gasAmountWei.toNumber(),
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