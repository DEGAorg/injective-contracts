import excess from "io-ts-excess";
import * as t from "io-ts";
import {
    createTxContext,
    TxContext,
    InjectiveTx,
    writeTxJsonOutput
} from "./transaction";
import fs from "fs";
import {sha256} from "@injectivelabs/sdk-ts";
import {BigNumberInBase} from "@injectivelabs/utils";
import path from "node:path";
import {
    getFilePathFromSpecFile,
    pathsDeploy,
    pathsDeployArtifacts,
    pathsWorkspace,
    replaceLineEndingsWithBreaks,
    replaceLineEndingsWithSlashN
} from "./context";
import * as zlib from "node:zlib";
import {generateTxJsonObj} from "./generate";
import {DeployError} from "./error";
import {CommandInfo} from "./main";
import {TypeC} from "io-ts";
import {makeSpecHelp} from "./help";


const govPropSpecDef = excess(t.type({
    network: t.keyof({
        Local: null,
        Testnet: null,
        Mainnet: null
    }),
    node: t.union([t.string, t.undefined, t.null]),
    contractVariant: t.keyof({
        Minter: null,
        Collection: null,
    }),
    deployAddress: t.string,
    wasmPath: t.string,
    wasmChecksum: t.string,
    proposalTitle: t.string,
    summaryFilePath: t.string,
    instantiateAddresses: t.union([t.array(t.string), t.undefined, t.null]),
    depositAmountINJ: t.number,
    note: t.union([t.string, t.undefined, t.null]),
}, "GovPropSpec"));


type GovPropSpec = t.TypeOf<typeof govPropSpecDef>;
interface GovPropContext extends TxContext<GovPropSpec> {}

interface MsgSubmitProposalStoreCode {
    messages: {
        sender: string;
        wasm_byte_code: string;
        instantiate_permission: {
            permission: string;
            addresses: string[];
        };
    }[];
    initial_deposit: {
        denom: string;
        amount: string;
    }[];
    proposer: string;
    metadata: string;
    title: string;
    summary: string;
}

const govPropCommand: CommandInfo = {
    name: "gov-prop",
    summary: "Create a governance proposal transaction for storing a wasm code with a formatted summary.",
    additionalUsage: "",
    run: govProp,
    specHelp: makeSpecHelp(govPropSpecDef),
}

export function getGovPropCommand(): CommandInfo {
    return govPropCommand;
}


export async function govProp(specPath: string, remainingArgs: string[]) {
    console.log("Creating governance proposal transaction...");
    console.log("");

    if (remainingArgs.length) {
        throw new DeployError("InputError", `Extra arguments`);
    }

    let context: GovPropContext = createTxContext(specPath, govPropSpecDef, "gov-prop");

    console.log(`Contract variant: ${context.spec.contractVariant}`);
    console.log("");

    const wasmPath = getFilePathFromSpecFile(context.spec.wasmPath);

    console.log(`Checksum for ${context.spec.contractVariant}: ${context.spec.wasmChecksum}`);
    const wasmContents = fs.readFileSync(wasmPath);
    const generatedChecksum = Buffer.from(sha256(wasmContents));
    const generatedChecksumString = generatedChecksum.toString('hex');
    console.log(`Generated Checksum for ${context.spec.contractVariant}: ${generatedChecksumString}`);
    if (generatedChecksumString != context.spec.wasmChecksum) {
        throw new DeployError("InputError", `Wasm checksum does not match for: ${context.spec.contractVariant}`);
    }

    const despositAmountInBaseInj = context.spec.depositAmountINJ;
    const despositAmountInWei = new BigNumberInBase(despositAmountInBaseInj).toWei().toFixed();

    const summaryFilePath = getFilePathFromSpecFile(context.spec.summaryFilePath);
    const summaryFileName = path.basename(summaryFilePath);
    let summaryContents = fs.readFileSync(summaryFilePath, "utf-8");

    const htmlPreview =
        `<html>\n` +
        `<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />\n` +
        replaceLineEndingsWithBreaks(summaryContents) + `\n` +
        `</html>\n`;

    const htmlPreviewFileName = summaryFileName.replace(".txt", `_${context.spec.contractVariant}.html`)
    const htmlPreviewPath = path.resolve(pathsDeployArtifacts, htmlPreviewFileName);
    fs.writeFileSync(htmlPreviewPath, htmlPreview);

    let txArgs = [];
    txArgs.push("wasm");
    txArgs.push("submit-proposal");
    txArgs.push("wasm-store");
    txArgs.push(`"${wasmPath}"`);
    txArgs.push(`--title="${context.spec.proposalTitle}"`);
    txArgs.push(`--summary="empty"`); // put an empty summary and replace later

    if (!context.spec.instantiateAddresses) {
        txArgs.push(`--instantiate-everybody=true`);
    } else {
        txArgs.push(`--instantiate-anyof-addresses="${context.spec.instantiateAddresses.join(",")}"`)
    }

    txArgs.push(`--deposit=${despositAmountInWei}inj`);

    // Max out the gas instead of estimating, since the margin for going through can be small and the gas cost is often high
    context.gas = new BigNumberInBase("50000000");

    const govPropTxJson: InjectiveTx<MsgSubmitProposalStoreCode> = await generateTxJsonObj(context, txArgs);

    summaryContents = replaceLineEndingsWithSlashN(summaryContents);

    govPropTxJson.body.messages[0].summary = summaryContents;

    const outCompressedWasmBuffer = Buffer.from(govPropTxJson.body.messages[0].messages[0].wasm_byte_code, 'base64');
    const outWasmBuffer = zlib.gunzipSync(outCompressedWasmBuffer);

    const outGeneratedChecksum = Buffer.from(sha256(outWasmBuffer));
    const outGeneratedChecksumString = outGeneratedChecksum.toString('hex');

    if (outGeneratedChecksumString != context.spec.wasmChecksum) {
        throw new DeployError("ScriptError", `Wasm checksum from injectived is invalid`);
    }

    writeTxJsonOutput(context, govPropTxJson);
}