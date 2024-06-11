import {fromBase64, sha256, toBase64} from "@injectivelabs/sdk-ts";
import {logObjectFullDepth} from "./tests/setup";
import {Config} from "./config";
import {getAppContext} from "./context";
import {DegaMinterQueryMsg, MintRequest} from "./messages/dega_minter_query";
import secp256k1 from "secp256k1";
import {Wallet} from "ethers";
import {bech32} from "bech32";
import { Address as EthereumUtilsAddress } from 'ethereumjs-util'
import {CommandInfo} from "./main";

let toolsCommand: CommandInfo = {
    name: "tools",
    aliases: ["utils", "debug"],
    summary: "A set of extra sub-commands for debugging and utility functions.",
    subCommands: []
}

export function getToolsCommand() {
    return toolsCommand;
}

export async function tools(args: string[]) {

    let sub_command = "info"; // default to query
    let sub_args = new Array<string>();

    let shift_result = args.shift();
    if (shift_result != undefined) {
        sub_command = shift_result;
    }

    switch (sub_command) {
        case "info":
            await toolsInfo(args);
            break;
        case "base64-as-object":
            toolsBase64AsObject(args);
            break;
        case "object-as-base64":
            toolsObjectAsBase64(args);
            break;
        case "make-sig":
            await toolsMakeSig(args);
            break;
        case "check-sig":
            await toolsCheckSig(args);
            break;
        case "derive-eth":
            await queryDeriveEthBasedAddress(args);
            break;
        default:
            console.log("Unknown test query sub-command: " + sub_command);
            break;
    }
}

async function toolsInfo(args: string[]) {
    const context = await getAppContext()

    console.log("Network: " + Config.NETWORK);
    console.log("Minter Address: " + context.minterAddress);
    console.log("CW721 Address: " + context.cw721Address);
    console.log("Primary Address: " + context.primaryAddress);
    console.log("Signer Address: " + context.signerAddress);
    console.log("Signer Compressed Pubkey Base64: " + context.signerCompressedPublicKey.toString('base64'));
    console.log("Local Genesis Address: " + context.localGenesisAddress);
}

function toolsBase64AsObject(args: string[]) {

    if (args.length < 1) {
        console.log("Usage: query print-base64-as-object <base64-string>");
        return;
    }

    const base64ObjectString = args[0];
    const object = fromBase64(base64ObjectString);
    console.log("Object JSON:");
    logObjectFullDepth(object);

    let objBuffer = Buffer.from(base64ObjectString, "base64");
    let msgMd5Hash = Buffer.from(sha256(objBuffer)); // echo -n 'test message' | sha256sum
    let msgHashHex = msgMd5Hash.toString("hex");

    console.log(`Message Hash Hex: ${msgHashHex}`);
}

function toolsObjectAsBase64(args: string[]) {

    if (args.length < 1) {
        console.log("Usage: query print-object-as-base64 <object-json-string>");
        return;
    }

    const jsonString = args[0];
    const base64String = toBase64(JSON.parse(jsonString));
    console.log("Base64 String:");
    console.log(base64String);
}

export async function toolsCheckSig(args: string[]) {

    const context = await getAppContext();

    let mintRequestMsg: MintRequest = {
        to: context.primaryAddress,
        primary_sale_recipient: context.primaryAddress,
        uri: "https://www.domain.com",
        price: "0",
        currency: context.primaryAddress,
        validity_start_timestamp: "0",
        validity_end_timestamp: "0",
        uuid: "00000000-0000-0000-0000-000000000000",
        collection: context.cw721Address
    };

    let mintRequestBase64 = toBase64(mintRequestMsg);


    let rawMessage = Buffer.from(mintRequestBase64, "base64");
    let msgMd5Hash = Buffer.from(sha256(rawMessage))
    //let uint8Array = new Uint8Array(buffer);


    let signingKey = context.signerSigningKey
    let signature = Buffer.from(secp256k1.ecdsaSign(msgMd5Hash, signingKey).signature)

    let sigBase64 = signature.toString("base64");

    console.log("Sig Length: " + sigBase64.length);

    console.log("Tx: ");
    console.log(mintRequestMsg);
    console.log();
    console.log("Signature: " + sigBase64);
    console.log();
    console.log("Address: " + context.signerAddress);
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
                pub_key_binary: Buffer.from(context.signerCompressedPublicKey).toString("base64")
            }
        }
    };

    const checkSigQueryResponse = await context.queryWasmApi.fetchSmartContractState(
        context.minterAddress,
        toBase64(checkSigQuery) // as DegaMinterQueryMsg),
    );

    const checkSigQueryResponseObject: object = fromBase64(
        Buffer.from(checkSigQueryResponse.data).toString("base64")
    );

    console.log(checkSigQueryResponseObject);
}

async function toolsMakeSig(args: string[]) {

    const context = await getAppContext();
    const message = args.shift();
    if (!message) {
        console.error("No message provided");
        return;
    }

    let mintRequestBase64 = toBase64({message});
    let buffer = Buffer.from(mintRequestBase64, "base64");
    //let uint8Array = new Uint8Array(buffer);

    const signature = await context.signerPrivateKey.sign(buffer);
    let sigBase64 = toBase64(signature);

    console.log("Signature:");
    console.log(sigBase64);
}

// https://docs.injective.network/learn/basic-concepts/accounts/#:~:text=Injective%20defines%20its%20own%20custom,'%2F0'%2F0%20.
async function queryDeriveEthBasedAddress(args: string[]) {
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
