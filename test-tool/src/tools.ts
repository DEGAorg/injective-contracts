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
import path from "node:path";
import fs from "fs";
import {UsageError} from "./error";

let toolsCommand: CommandInfo = {
    name: "tools",
    aliases: ["utils", "debug"],
    summary: "A set of extra sub-commands for debugging and utility functions.",
    subCommands: []
}

export function getToolsCommand() {
    return toolsCommand;
}

toolsCommand.subCommands.push({
    name: "info",
    additionalUsage: "",
    summary: "Displays the current network, addresses, and public key in use.",
    run: toolsInfo
});
async function toolsInfo(args: string[]) {
    const context = await getAppContext()

    console.log("");
    console.log("Network: " + Config.NETWORK);
    console.log("Minter Address: " + context.minterAddress);
    console.log("CW721 Address: " + context.cw721Address);
    console.log("Primary Address: " + context.primaryAddress);
    console.log("Signer Address: " + context.signerAddress);
    console.log("Signer Compressed Pubkey Base64: " + context.signerCompressedPublicKey.toString('base64'));
    console.log("Local Genesis Address: " + context.localGenesisAddress);
    console.log("");
}

toolsCommand.subCommands.push({
    name: "base-64-as-object",
    additionalUsage: "<base64-string>",
    summary: "Takes a base64 string and prints it out as a JSON object using Injective's deserialization.",
    run: toolsBase64AsObject
});
async function toolsBase64AsObject(args: string[]) {

    if (args.length != 1) {
        throw new UsageError("Bad arguments.");
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

toolsCommand.subCommands.push({
    name: "object-as-base64",
    additionalUsage: "<object-json-string>",
    summary: "Takes a JSON object and prints it out as a base64 string using Injective's serialization.",
    run: toolsObjectAsBase64
});
async function toolsObjectAsBase64(args: string[]) {

    if (args.length != 1) {
        throw new UsageError("Bad arguments.");
    }

    const jsonString = args[0];
    const base64String = toBase64(JSON.parse(jsonString));
    console.log("Base64 String:");
    console.log(base64String);
}

toolsCommand.subCommands.push({
    name: "make-sig",
    additionalUsage: "<message (string|json)>",
    summary: "Creates and outputs a string for an arbitrary input message string or JSON",
    run: toolsMakeSig
});
async function toolsMakeSig(args: string[]) {

    const context = await getAppContext();

    if (args.length != 1) {
        throw new UsageError("Bad arguments.");
    }

    const message = args.shift();

    let mintRequestBase64 = toBase64({message});
    let buffer = Buffer.from(mintRequestBase64, "base64");
    //let uint8Array = new Uint8Array(buffer);

    const signature = await context.signerPrivateKey.sign(buffer);
    let sigBase64 = toBase64(signature);

    console.log("Signature:");
    console.log(sigBase64);
}

toolsCommand.subCommands.push({
    name: "derive-eth",
    additionalUsage: "",
    summary: "A test function for generating an ethereum based address based on a Mnemonic",
    run: queryDeriveEthBasedAddress
});
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

toolsCommand.subCommands.push({
    name: "gov-summary-test",
    additionalUsage: "",
    summary: "A test function for the formatting and output of the governance proposal summary.",
    run: toolsGovSummaryTest
});
async function toolsGovSummaryTest(args: string[]) {

    const summaryFileName = "test-post.txt";
    const summaryFilePath = path.resolve(__dirname, "../data", summaryFileName);
    const summaryContents = fs.readFileSync(summaryFilePath, "utf-8");

    const htmlPreview =
        `<html>\n` +
        `<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />\n` +
        replaceLineEndingsWithBreaks(summaryContents) + `\n` +
        `</html>\n`;

    const htmlPreviewFileName = summaryFileName.replace(".txt", ".html")
    const htmlPreviewPath = path.resolve(__dirname, "../cache", htmlPreviewFileName);
    fs.writeFileSync(htmlPreviewPath, htmlPreview);

    console.log("===============")
    console.log("==   INPUT   ==")
    console.log("===============")
    console.log("")
    console.log(summaryContents);
    console.log("")
    console.log("")
    console.log("")
    console.log("")

    // Replace carrots for HTML in the front end
    const unicodeEncodedSummaryString = replaceWithUnicode(summaryContents);

    // Replace line endings with \n
    const newLineNormalizedSummaryString = replaceLineEndingsWithSlashN(unicodeEncodedSummaryString);

    // Replace double quotes for the command line command
    const escapedSummaryString = escapeDoubleQuotes(newLineNormalizedSummaryString);


    console.log("================")
    console.log("==   OUTPUT   ==")
    console.log("================")
    console.log("")
    console.log(escapedSummaryString);
    console.log("")
}

export function replaceLineEndingsWithBreaks(input: string): string {
    // Replace Windows-style line endings
    let result = input.replace(/\r\n/g, '<br>\r\n');

    // Replace Unix-style line endings
    result = result.replace(/\n/g, '<br>\n');

    return result;
}



export function replaceLineEndingsWithSlashN(input: string): string {
    // Replace Windows-style line endings
    let result = input.replace(/\r\n/g, '\\n');

    // Replace Unix-style line endings
    result = result.replace(/\n/g, '\\n');

    return result;
}

export function replaceWithUnicode(input: string): string {
    let result = input.replace(/</g, '\\u003C');
    result = result.replace(/>/g, '\\u003E');
    return result;
}

export function escapeDoubleQuotes(input: string): string {
    return input.replace(/"/g, '\\"');
}