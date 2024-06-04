import fs from "fs";
import util from "util";
import path from "node:path";
import * as t from "io-ts";
import { failure } from 'io-ts/lib/PathReporter'
import {isLeft} from "fp-ts/Either";
import {Network} from "@injectivelabs/networks";
import {ChainId} from "@injectivelabs/ts-types";
import { execSync } from 'child_process';
import excess from "io-ts-excess";
import {decode} from "./deploy";




const pathDeploy = path.resolve(__dirname, "..", "..");
const pathArtifacts = path.join(pathDeploy, "artifacts");

const signingInfoSpec = excess(t.type({
    txJsonFilePath: t.union([t.string, t.undefined, t.null]),
    signerKeyName: t.string,
    network: t.keyof({
        Local: null,
        Testnet: null,
        Mainnet: null
    }),
    offline: t.boolean,
    accountNumber: t.union([t.number, t.undefined, t.null]),
    sequenceNumber: t.union([t.number, t.undefined, t.null]),
    note: t.union([t.string, t.undefined, t.null])
}, "SigningInfoSpec"));

type SigningInfoSpec = t.TypeOf<typeof signingInfoSpec>;


main()

function main() {

    (async () => {

        try {
            await runMain()
        } catch (e) {

            console.error("Error while deploying: ")
            console.error(e)

            process.exit(1)
        }

    })()
}


function loadSigningInfoSpec(specPath: string) {

    const fileContents = fs.readFileSync(specPath, 'utf-8')
    const jsonData = JSON.parse(fileContents)
    return decode(signingInfoSpec, jsonData)
}

async function runMain() {

    let args = new Array<string>()

    const usage = "Usage: node sign.js <signing-info-spec-path> [<tx-json-file-path>]";

    // Find the index of the argument containing the filename
    let filenameIndex = process.argv.findIndex(arg => arg.includes('sign.js'))
    if (filenameIndex !== -1) {
        // Get all the remaining arguments after the filename

        args = process.argv.slice(filenameIndex + 1)

    } else {
        throw new Error(`Missing script name argument`)
    }

    const callerWorkingDirFromEnv = process.env.INIT_CWD;
    console.log("INIT_CWD: " + callerWorkingDirFromEnv);
    if (!callerWorkingDirFromEnv) {
        throw new Error("Missing INIT_CWD in PATH to find the caller's working directory");
    }
    const pathCallerWorkingDir = path.resolve(callerWorkingDirFromEnv);

    const specPathArg = args.shift();

    if (!specPathArg) {
        throw new Error(`Missing signing info spec path argument. ${usage}`)
    }

    const specPath = path.join(pathCallerWorkingDir, specPathArg);
    console.log('Signing info spec path: ' + specPath);

    let signingInfoSpec: SigningInfoSpec = loadSigningInfoSpec(specPath)

    console.log('Loaded deploy spec:')
    console.log(signingInfoSpec)

    let network: Network;
    let chainId: ChainId;
    let endpoint: string;

    if (signingInfoSpec.network === "Local") {
        network = Network.Local;
        chainId = ChainId.Mainnet; // Local uses the mainnet chainId
        endpoint = "http://localhost:26657";
    } else if (signingInfoSpec.network === "Testnet") {
        network = Network.Testnet
        chainId = ChainId.Testnet;
        endpoint = "https://testnet.sentry.tm.injective.network:443";
    } else if (signingInfoSpec.network === "Mainnet") {
        network = Network.Mainnet
        chainId = ChainId.Mainnet;
        endpoint = "https://sentry.tm.injective.network:443";
    } else {
        throw new Error("Invalid network")
    }

    const INJECTIVED_PASSWORD = process.env.INJECTIVED_PASSWORD;

    if (!INJECTIVED_PASSWORD) {
        throw new Error("Missing INJECTIVED_PASSWORD environment variable")
    }

    let txJsonFilePath;

    if (signingInfoSpec.txJsonFilePath) {
        const txJsonRelativeFilePath = signingInfoSpec.txJsonFilePath;
        txJsonFilePath = path.join(pathDeploy, txJsonRelativeFilePath);
    } else {
        const txJsonArgFilePathArg = args.shift();
        if (!txJsonArgFilePathArg) {
            throw new Error(`Must specify tx JSON file path argument if not provided in the spec file.  ${usage}`)
        }
        txJsonFilePath = path.join(pathCallerWorkingDir, txJsonArgFilePathArg);
    }

    console.log('Transaction to sign path: ' + specPath);

    if (!fs.existsSync(txJsonFilePath)) {
        throw new Error(`Tx JSON file does not exist: ${txJsonFilePath}`);
    }


    const getKeyCommand = `echo ${INJECTIVED_PASSWORD} | injectived keys show ${signingInfoSpec.signerKeyName} -a`

    const signerAddress = execSync(getKeyCommand, { encoding: 'utf-8' });
    console.log("Signer Address: " + signerAddress);

    const unsignedTxJsonObj = JSON.parse(fs.readFileSync(txJsonFilePath, 'utf-8'));

    if (!unsignedTxJsonObj["body"] ||
        !unsignedTxJsonObj["body"]["messages"] ||
        !unsignedTxJsonObj["body"]["messages"].length) {
        throw new Error("Invalid transaction JSON file")
    }

    if (unsignedTxJsonObj.body.messages[0]["@type"] === "/cosmos.gov.v1.MsgSubmitProposal") {
        if (!unsignedTxJsonObj["body"] ||
            !unsignedTxJsonObj["body"]["messages"] ||
            !unsignedTxJsonObj["body"]["messages"].length ||
            !unsignedTxJsonObj["body"]["messages"][0]["proposer"]) {
            throw new Error("Invalid governance proposal transaction JSON file")
        }

        const proposerAddress = unsignedTxJsonObj["body"]["messages"][0]["proposer"];

        console.log("Proposer address from Submit Proposal Tx: " + proposerAddress);

        if (signerAddress.trim() !== proposerAddress) {
            throw new Error("Signer address does not match the proposer address in the tx JSON file")
        }
    }


    if (signingInfoSpec.offline &&
        (!signingInfoSpec.accountNumber || !signingInfoSpec.sequenceNumber)) {
        throw new Error("Missing account number or sequence number for offline signing")
    }

    let baseTxArgs = [];
    baseTxArgs.push(`injectived`);
    baseTxArgs.push(`tx`);
    baseTxArgs.push(`sign`);
    baseTxArgs.push(`${txJsonFilePath}`);
    baseTxArgs.push(`--chain-id="${chainId}"`);
    baseTxArgs.push(`--from=${signingInfoSpec.signerKeyName}`);

    if (signingInfoSpec.offline) {
        baseTxArgs.push(`--offline`);
        baseTxArgs.push(`--account-number=${signingInfoSpec.accountNumber}`);
        baseTxArgs.push(`--sequence=${signingInfoSpec.sequenceNumber}`);
    } else {
        baseTxArgs.push(`--node=${endpoint}`);
    }

    console.log("CLI Command:");
    console.log(baseTxArgs.join(` `));

    let fullTxArgs = [];
    fullTxArgs.push("echo");
    fullTxArgs.push(`${INJECTIVED_PASSWORD}`);
    fullTxArgs.push(`|`);
    fullTxArgs = fullTxArgs.concat(baseTxArgs);

    const rawSignedTxString = execSync(fullTxArgs.join(` `), { encoding: 'utf-8' });

    console.log("Signed Tx:");
    console.log(rawSignedTxString);
    console.log("");

    let signedTxJsonFileName = "signed-" + path.basename(txJsonFilePath);
    const signedTxJsonFilePath = path.join(pathArtifacts, signedTxJsonFileName);

    console.log("Writing signed tx to: ");
    console.log(signedTxJsonFilePath);
    console.log("");

    let signedTxJsonObj: any = JSON.parse(rawSignedTxString) as any;

    fs.writeFileSync(signedTxJsonFilePath, JSON.stringify(signedTxJsonObj, null, 2));
}


