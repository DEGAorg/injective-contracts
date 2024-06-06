import excess from "io-ts-excess";
import * as t from "io-ts";
import {createTxContext, InjectiveTx, TxContext} from "./transaction";
import {execSync} from "child_process";
import path from "node:path";
import fs from "fs";
import {
    getFilePathFromSpecFile,
    pathsDeployArtifacts,
} from "./context";
import {addUsage} from "./main";
import {DeployError} from "./error";


const signSpecDef = excess(t.type({
    network: t.keyof({
        Local: null,
        Testnet: null,
        Mainnet: null
    }),
    node: t.union([t.string, t.undefined, t.null]),


    txJsonFilePath: t.union([t.string, t.undefined, t.null]),
    signerKeyName: t.string,
    offline: t.boolean,
    accountNumber: t.union([t.number, t.undefined, t.null]),
    sequenceNumber: t.union([t.number, t.undefined, t.null]),


    note: t.union([t.string, t.undefined, t.null]),
}, "SignSpec"));


type SignSpec = t.TypeOf<typeof signSpecDef>;
interface SignContext extends TxContext<SignSpec> {}



export async function sign(specPath: string, remainingArgs: string[]) {

    addUsage("[<tx-json-file-path>]");

    console.log("Creating signing transaction...");
    console.log("");

    let context: SignContext = createTxContext(specPath, signSpecDef, "signed");


    const INJECTIVED_PASSWORD = process.env.INJECTIVED_PASSWORD;

    if (!INJECTIVED_PASSWORD) {
        throw new DeployError("InputError", "Missing INJECTIVED_PASSWORD environment variable")
    }

    let txJsonFilePath;

    if (context.spec.txJsonFilePath) {
        txJsonFilePath = getFilePathFromSpecFile(context.spec.txJsonFilePath);
    } else {
        const txJsonArgFilePathArg = remainingArgs.shift();
        if (!txJsonArgFilePathArg) {
            throw new DeployError("UsageError", `Must specify tx JSON file path argument if not provided in the spec file`)
        } else if (remainingArgs.length) {
            throw new DeployError("UsageError", `Too many arguments`)
        }

        const callerWorkingDirFromEnv = process.env.INIT_CWD;
        if (!callerWorkingDirFromEnv) {
            throw new DeployError("ScriptError", "Missing INIT_CWD in PATH to find the caller's working directory");
        }
        const callerWorkingDir = path.resolve(callerWorkingDirFromEnv);

        txJsonFilePath = path.join(callerWorkingDir, txJsonArgFilePathArg);

        if (!fs.existsSync(txJsonFilePath)) {
            throw new DeployError("UsageError", `Tx JSON file specified at the command line does not exist: ${txJsonFilePath}`);
        }
    }

    console.log('Transaction to sign path: ' + specPath);

    const getKeyCommand = `echo ${INJECTIVED_PASSWORD} | injectived keys show ${context.spec.signerKeyName} -a`

    const signerAddress = execSync(getKeyCommand, { encoding: 'utf-8' });
    console.log("Signer Address: " + signerAddress);

    const unsignedTxJsonObj = JSON.parse(fs.readFileSync(txJsonFilePath, 'utf-8'));

    if (!unsignedTxJsonObj["body"] ||
        !unsignedTxJsonObj["body"]["messages"] ||
        !unsignedTxJsonObj["body"]["messages"].length) {
        throw new DeployError("InputError", "Invalid transaction JSON file, no messages found.")
    }

    if (unsignedTxJsonObj.body.messages[0]["@type"] === "/cosmos.gov.v1.MsgSubmitProposal") {
        if (!unsignedTxJsonObj["body"] ||
            !unsignedTxJsonObj["body"]["messages"] ||
            !unsignedTxJsonObj["body"]["messages"].length ||
            !unsignedTxJsonObj["body"]["messages"][0]["proposer"]) {
            throw new DeployError("InputError", "Invalid governance proposal transaction JSON file, proposer missing.")
        }

        const proposerAddress = unsignedTxJsonObj["body"]["messages"][0]["proposer"];

        console.log("Proposer address from Submit Proposal Tx: " + proposerAddress);

        if (signerAddress.trim() !== proposerAddress) {
            throw new DeployError("InputError", "Signer address does not match the proposer address in the tx JSON file.")
        }
    }

    let baseTxArgs = [];
    baseTxArgs.push(`injectived`);
    baseTxArgs.push(`tx`);
    baseTxArgs.push(`sign`);
    baseTxArgs.push(`${txJsonFilePath}`);
    baseTxArgs.push(`--chain-id="${context.chainId}"`);
    baseTxArgs.push(`--from=${context.spec.signerKeyName}`);

    if (context.spec.offline) {
        if (!context.spec.accountNumber || !context.spec.sequenceNumber) {
            throw new DeployError("InputError", "Missing account number or sequence number for offline signing")
        }
        baseTxArgs.push(`--offline`);
        baseTxArgs.push(`--account-number=${context.spec.accountNumber}`);
        baseTxArgs.push(`--sequence=${context.spec.sequenceNumber}`);
    } else {
        if (!context.node) {
            throw new DeployError("ScriptError", "Node URL is undefined in the context")
        }

        baseTxArgs.push(`--node=${context.node}`);
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
    const signedTxJsonFilePath = path.join(pathsDeployArtifacts, signedTxJsonFileName);

    console.log("Writing signed tx to: ");
    console.log(signedTxJsonFilePath);
    console.log("");

    let signedTxJsonObj: any = JSON.parse(rawSignedTxString) as any;

    fs.writeFileSync(signedTxJsonFilePath, JSON.stringify(signedTxJsonObj, null, 2));

}