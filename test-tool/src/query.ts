import {Context} from "./context";
import {Config} from "./config";
import {fromBase64, toBase64} from "@injectivelabs/sdk-ts";
import {DegaMinterQueryMsg} from "./messages";
import { Wallet } from 'ethers'
import { Address as EthereumUtilsAddress } from 'ethereumjs-util'
import secp256k1 from 'secp256k1'
import { bech32 } from 'bech32'

export async function query(args: string[]) {

    let sub_command = "info"; // default to query
    let sub_args = new Array<string>();

    let shift_result = args.shift();
    if (shift_result != undefined) {
        sub_command = shift_result;
    }

    switch (sub_command) {
        case "info":
            await info(args);
            break;
        case "sig-test":
            await sigTest(args);
            break;
        case "derive-eth":
            await deriveEthBasedAddress();
            break;
        default:
            console.log("Unknown test query sub-command: " + sub_command);
            break;
    }
}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        
export async function info(args: string[]) {

    const bankBalances = await Context.chainGrpcBankApi.fetchBalances(Context.primaryAddress);
    console.log(bankBalances);

    //const queryFromObject = toBase64({ get_coin: {} })

    // let signedVAA: Uint8Array = new Uint8Array(0);
    // let otherQuert = {
    //     is_vaa_redeemed: {
    //         vaa: fromUint8Array(signedVAA),
    //     }
    // };

    let configQuery: DegaMinterQueryMsg = {config: {}};
    const configQueryResponse = await Context.chainGrpcWasmApi.fetchSmartContractState(
        Config.MINTER_ADDRESS,
        toBase64({config: {}}),
    );

    const configQueryResponseObject: object = fromBase64(
        Buffer.from(configQueryResponse.data).toString("base64")
    );
    //const { count } = configQueryResponseObject as { count: number };

    console.log(configQueryResponseObject);

    let collectionInfoQuery: DegaMinterQueryMsg = {collection_info: {}};

    const collectionInfoQueryResponse = await Context.chainGrpcWasmApi.fetchSmartContractState(
        Config.CW721_ADDRESS,
        toBase64(collectionInfoQuery),
    );

    const collectionInfoQueryResponseObject: object = fromBase64(
        Buffer.from(collectionInfoQueryResponse.data).toString("base64")
    );
    //const { count } = collectionInfoQueryResponseObject as { count: number };

    console.log(collectionInfoQueryResponseObject);

}

async function sigTest(args: string[]) {

    // let mintRequestMsg = { //: MintRequest = {
    //     to: Context.primaryAddress,
    //     royalty_recipient: Context.primaryAddress,
    //     royalty_bps: "0",
    //     primary_sale_recipient: Context.primaryAddress,
    //     uri: "https://www.domain.com",
    //     price: "0",
    //     currency: Context.primaryAddress,
    //     validity_start_timestamp: "0",
    //     validity_end_timestamp: "0",
    //     uid: 0,
    // };

    let message = "test message";
    let md5_hash = "3f0a377ba0a4a460ecb616f6507ce0d8cfa3e704025d4fda3ed0c5ca05468728"; // echo -n 'test message' | sha256sum

    //let mintRequestBase64 = toBase64({md5_hash} );
    let buffer = Buffer.from(md5_hash, "hex");
//let uint8Array = new Uint8Array(buffer);

    // sign(messageBytes: Buffer): Promise<Uint8Array>;
    // signEcda(messageBytes: Buffer): Promise<Uint8Array>;
    // signHashed(messageHashedBytes: Buffer): Promise<Uint8Array>;
    // signHashedEcda(messageHashedBytes: Buffer): Promise<Uint8Array>;

    const signature = await Context.signerPrivateKey.signHashedEcda(buffer);
    let sigBase64 = toBase64(signature);

    console.log("Sig Length: " + sigBase64.length);

    console.log("Message Hash: ");
    console.log(md5_hash);
    console.log();
    console.log("Signature: " + sigBase64);
    console.log();
    console.log("Address: " + Context.signerAddress);
    console.log();

    const checkSigQueryResponse =
        await Context.chainGrpcWasmApi.fetchSmartContractState(
        Config.MINTER_ADDRESS,
        toBase64({
            // check_sig: {
            //     //mint_request: mintRequestBase64,
            //     signature: sigBase64,
            //     //maybe_signer: null,
            // }
            check_sig: {
                message: message,
                signature: sigBase64,
                maybe_signer: null,
            }

        } as DegaMinterQueryMsg));

    const checkSigQueryResponseObject: object = fromBase64(
        Buffer.from(checkSigQueryResponse.data).toString("base64")
    );

    console.log(checkSigQueryResponseObject);
}


// https://docs.injective.network/learn/basic-concepts/accounts/#:~:text=Injective%20defines%20its%20own%20custom,'%2F0'%2F0%20.
async function deriveEthBasedAddress() {
    const mnemonic = Config.PRIVATE_KEY_MNEMONIC;
    //const privateKey = "private key seed hex"
    const wallet = Wallet.fromMnemonic(mnemonic);
    const privateKey = wallet.privateKey;
    const defaultDerivationPath = "m/44'/60'/0'/0/0"
    const defaultBech32Prefix = 'inj'
    const isPrivateKey: boolean = true /* just for the example */

    //const wallet = isPrivateKey ? Wallet.fromMnemonic(mnemonic, defaultDerivationPath) : new Wallet(privateKey)
    const ethereumAddress = wallet.address
    const addressBuffer = EthereumUtilsAddress.fromString(ethereumAddress.toString()).toBuffer()
    const injectiveAddress = bech32.encode(defaultBech32Prefix, bech32.toWords(addressBuffer))

    console.log("mnemonic:")
    console.log(mnemonic)

    console.log("private key seed hex:")
    console.log(privateKey)

    console.log("injectiveAddress:")
    console.log(injectiveAddress)
}

function deriveSecp256k1Address() {
    const privateKey = Context.primaryPrivateKey.toPrivateKeyHex()
    const privateKeyHex = Buffer.from(privateKey, 'hex')
    const publicKeyByte = secp256k1.publicKeyCreate(privateKeyHex)

    const buf1 = Buffer.from([10])
    const buf2 = Buffer.from([publicKeyByte.length])
    const buf3 = Buffer.from(publicKeyByte)

    const publicKey = Buffer.concat([buf1, buf2, buf3]).toString('base64')
    const type = '/injective.crypto.v1beta1.ethsecp256k1.PubKey'
}