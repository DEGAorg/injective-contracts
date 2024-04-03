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

config();

let PRIVATE_KEY_MNEMONIC = process.env.PRIVATE_KEY_MNEMONIC as string;
let MINTER_ADDRESS = process.env.MINTER_ADDRESS as string;
let CW721_ADDRESS = process.env.CW721_ADDRESS as string;
let NETWORK = Network.Testnet;

let SIGNER_KEY_MNEMONIC = process.env.SIGNER_KEY_MNEMONIC as string;

const primaryPrivateKey = PrivateKey.fromMnemonic(PRIVATE_KEY_MNEMONIC);
const primaryAddress = primaryPrivateKey.toBech32();



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

    // Private Key based Transaction example: (Also includes details on signing a message with the cosmos library)
    // https://github.com/InjectiveLabs/injective-ts/blob/ce8f591ea66e15f3a620734146a342ecb94bb2d6/.gitbook/transactions/private-key.md

    // https://github.com/CosmWasm/cosmwasm/tree/main/packages/crypto
    // https://github.com/CosmWasm/cosmwasm/blob/main/packages/crypto/src/secp256k1.rs
}





function main() {
    (async () => {

        await query();


    })();
}

main();
