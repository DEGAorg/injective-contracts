import {Context} from "./context";
import {Config} from "./config";
import {fromBase64, sha256, toBase64} from "@injectivelabs/sdk-ts";
import {DegaCw721QueryMsg, DegaMinterQueryMsg} from "./messages";
import { Wallet } from 'ethers'
import { SigningKey } from '@ethersproject/signing-key'
import { Address as EthereumUtilsAddress } from 'ethereumjs-util'
import secp256k1 from 'secp256k1'
import { randomBytes } from 'crypto'
import { bech32 } from 'bech32'
import {MintRequest, SignerSourceTypeEnum} from "./messages/dega_minter_query";

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
        case "check-sig":
            await checkSig(args);
            break;
        case "sig-info":
            await sigInfo(args);
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
        toBase64(configQuery),
    );

    const configQueryResponseObject: object = fromBase64(
        Buffer.from(configQueryResponse.data).toString("base64")
    );
    //const { count } = configQueryResponseObject as { count: number };

    console.log(configQueryResponseObject);

    let collectionInfoQuery: DegaCw721QueryMsg = {collection_info: {}};

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



export async function checkSig(args: string[]) {

    let mintRequestMsg: MintRequest = {
        to: Context.primaryAddress,
        primary_sale_recipient: Context.primaryAddress,
        uri: "https://www.domain.com",
        price: "0",
        currency: Context.primaryAddress,
        validity_start_timestamp: "0",
        validity_end_timestamp: "0",
        uid: 0,
    };

    let mintRequestBase64 = toBase64(mintRequestMsg);


    let rawMessage = Buffer.from(mintRequestBase64, "base64");
    let msgMd5Hash = Buffer.from(sha256(rawMessage))
    //let uint8Array = new Uint8Array(buffer);


    let signingKey = Context.signerSigningKey
    let signature = Buffer.from(secp256k1.ecdsaSign(msgMd5Hash, signingKey).signature)

    let sigBase64 = signature.toString("base64");

    console.log("Sig Length: " + sigBase64.length);

    console.log("Tx: ");
    console.log(mintRequestMsg);
    console.log();
    console.log("Signature: " + sigBase64);
    console.log();
    console.log("Address: " + Context.signerAddress);
    console.log();

    let checkSigQuery: DegaMinterQueryMsg = {
        check_sig: {
            message: {
                mint_request: mintRequestMsg
                //string: rawTextMessage // Uncomment to test with a string instead of the mint request
            },
            signature: sigBase64,
            //signer_source: SignerSourceTypeEnum.ConfigSignerPubKey
            // Uncomment below to test validating with a local public key using on chain logic
            signer_source: {
                pub_key_binary: Buffer.from(Context.signerCompressedPublicKey).toString("base64")
            }
        }
    };

    const checkSigQueryResponse = await Context.chainGrpcWasmApi.fetchSmartContractState(
        Config.MINTER_ADDRESS,
        toBase64(checkSigQuery) // as DegaMinterQueryMsg),
    );

    const checkSigQueryResponseObject: object = fromBase64(
        Buffer.from(checkSigQueryResponse.data).toString("base64")
    );

    console.log(checkSigQueryResponseObject);
}

async function sigInfo(args: string[]) {

    let rawTextMessage = "test message";

    let mintRequestMsg: MintRequest = {
        to: Context.primaryAddress,
        primary_sale_recipient: Context.primaryAddress,
        uri: "https://www.domain.com",
        price: "0",
        currency: "inj",
        validity_start_timestamp: "0",
        validity_end_timestamp: "0",
        uid: 0,
    };

    //let rawMessage = Buffer.from(rawTextMessage, "utf-8");
    let rawMessage = Buffer.from(toBase64(mintRequestMsg), "base64");


    //let mintRequestBase64 = toBase64({md5_hash} );

    let msgMd5Hash = Buffer.from(sha256(rawMessage)); // echo -n 'test message' | sha256sum
    let msgHashHex = msgMd5Hash.toString("hex");

    let signingKey = Context.signerSigningKey;
    //let signingKey = randomBytes(32);

    //console.log("Signing Key Hex: " + signingKey.toString("hex"));
    //console.log("Signing Key Base64: " + signingKey.toString("base64"));
    //console.log("Signing Key Length: " + signingKey.length);

    let publicKey = Context.signerCompressedPublicKey;

    console.log("Compressed Pubkey Hex: " + publicKey.toString("hex"));
    console.log("Compressed Pubkey Base64: " + publicKey.toString("base64"));
    console.log("Compressed Pubkey Length: " + publicKey.length);

    let signature = Buffer.from(secp256k1.ecdsaSign(msgMd5Hash, signingKey).signature);
    let sigHex = signature.toString("hex");
    let sigBase64 = signature.toString("base64");

    console.log("Message Hash: ");
    console.log(msgHashHex);
    console.log();
    console.log("Signature Hex: " + sigHex);
    console.log("Signature Base64: " + sigBase64);
    console.log("Signature Length: " + signature.length);
    console.log();
    console.log("Address: " + Context.signerAddress);
    console.log();

    let checkSigQuery: DegaMinterQueryMsg = {
        check_sig: {
            message: {
                mint_request: mintRequestMsg
                //string: rawTextMessage
            },
            signature: sigBase64,
            signer_source: SignerSourceTypeEnum.ConfigSignerPubKey
            // signer_source: {
            //     pub_key_binary: Buffer.from(Context.signerCompressedPublicKey).toString("base64")
            // }
        }
    };

    const checkSigQueryResponse =
        await Context.chainGrpcWasmApi.fetchSmartContractState(
        Config.MINTER_ADDRESS,
        toBase64(checkSigQuery));

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
    const addressBufferHex = addressBuffer.toString('hex');
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