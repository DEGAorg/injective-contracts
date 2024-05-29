import fs from "fs";
import util from "util";
import path from "node:path";
import * as t from "io-ts";
import {isLeft} from "fp-ts/Either";
import {Network} from "@injectivelabs/networks";
import {ChainId} from "@injectivelabs/ts-types";
import { execSync } from 'child_process';



const pathDeploy = path.resolve(__dirname, "..", "..");
const pathArtifacts = path.join(pathDeploy, "artifacts");

const signingInfoSpec = t.type({
    txJsonFilePath: t.string,
    signerKeyName: t.string,
    network: t.keyof({
        Local: null,
        Testnet: null,
        Mainnet: null
    }),
    offline: t.boolean,
    accountNumber: t.union([t.number, t.undefined, t.null]),
    sequenceNumber: t.union([t.number, t.undefined, t.null]),
});

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
    return signingInfoSpec.decode(jsonData)
}

async function runMain() {

    let args = new Array<string>()

    // Find the index of the argument containing the filename
    let filenameIndex = process.argv.findIndex(arg => arg.includes('sign.js'))
    if (filenameIndex !== -1) {
        // Get all the remaining arguments after the filename

        args = process.argv.slice(filenameIndex + 1)

    } else {
        throw new Error("Missing script name argument")
    }

    if (args.length !== 1) {
        throw new Error("Missing signing info spec path argument")
    }

    const signingInfoSpecRelativePath = args[0]
    const signingInfoSpecPath = path.join(pathDeploy, signingInfoSpecRelativePath);

    console.log('Signing info spec path: ' + signingInfoSpecPath);

    let signingInfoSpecResult = loadSigningInfoSpec(signingInfoSpecPath)

    if (isLeft(signingInfoSpecResult)) {
        throw new Error('Invalid data:' + signingInfoSpecResult.left)
    }

    const signingInfoSpec: SigningInfoSpec = signingInfoSpecResult.right
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

    const txJsonRelativeFilePath = signingInfoSpec.txJsonFilePath;
    const txJsonFilePath = path.join(pathDeploy, txJsonRelativeFilePath);

    if (!fs.existsSync(txJsonFilePath)) {
        throw new Error(`Tx JSON file does not exist: ${txJsonFilePath}`);
    }

    const unsignedTxJsonObj = JSON.parse(fs.readFileSync(txJsonFilePath, 'utf-8'));

    if (!unsignedTxJsonObj["body"] ||
        !unsignedTxJsonObj["body"]["messages"] ||
        !unsignedTxJsonObj["body"]["messages"].length ||
        !unsignedTxJsonObj["body"]["messages"][0]["proposer"]) {
        throw new Error("Invalid governance proposal transaction JSON file")
    }

    const proposerAddress = unsignedTxJsonObj["body"]["messages"][0]["proposer"];

    console.log("Proposer address from Submit Proposal Tx: " + proposerAddress);

    const getKeyCommand = `echo ${INJECTIVED_PASSWORD} | injectived keys show ${signingInfoSpec.signerKeyName} -a`

    const signerAddress = execSync(getKeyCommand, { encoding: 'utf-8' });
    console.log("Signer Address: " + signerAddress);

    if (signerAddress.trim() !== proposerAddress) {
        throw new Error("Signer address does not match the proposer address in the tx JSON file")
    }

    if (signingInfoSpec.offline &&
        (!signingInfoSpec.accountNumber || !signingInfoSpec.sequenceNumber)) {
        throw new Error("Missing account number or sequence number for offline signing")
    }

    let txArgs = [];
    txArgs.push(`echo`);
    txArgs.push(`${INJECTIVED_PASSWORD}`);
    txArgs.push(`|`);
    txArgs.push(`injectived`);
    txArgs.push(`tx`);
    txArgs.push(`sign`);
    txArgs.push(`${txJsonFilePath}`);
    txArgs.push(`--chain-id="${chainId}"`);
    txArgs.push(`--from=${signingInfoSpec.signerKeyName}`);

    if (signingInfoSpec.offline) {
        txArgs.push(`--offline`);
        txArgs.push(`--account-number=${signingInfoSpec.accountNumber}`);
        txArgs.push(`--sequence=${signingInfoSpec.sequenceNumber}`);
    } else {
        txArgs.push(`--node=${endpoint}`);
    }

    //txArgs.push(`--gas=auto`);
    //txArgs.push(`--gas-adjustment=1.5`);

    console.log("CLI Command:");
    console.log(txArgs.join(` `));

    const rawSignedTxString = execSync(txArgs.join(` `), { encoding: 'utf-8' });

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

    // txArgs.push(`--from=${govProposalSpec.proposerAddress}`);
    // txArgs.push(`--generate-only`);

    // For broadcast
    // txArgs.push(`--broadcast-mode=sync`);
    // txArgs.push(`--node=${context.deployTxBroadcaster.endpoints.rpc}`);
    // txArgs.push(`--gas=${gas}`);
    // txArgs.push(`--gas-prices=${gasPrices}inj`);
    // txArgs.push(`--yes`);
    // txArgs.push(`--output`);
    // txArgs.push(`json`);
    // if (govProposalSpec.dryRun) {
    //     txArgs.push(`--dry-run`);
    // }

    // const outputJsonTxFilepath = path.join(pathsDeployArtifacts, "proposal-tx_" + contractName + ".json");
    // const txJsonStringUnformatted = await run(context, "injectived", txArgs);


}


