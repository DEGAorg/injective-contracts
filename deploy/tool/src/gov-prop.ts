import excess from "io-ts-excess";
import * as t from "io-ts";
import {
    createTxContext,
    TxContext,
    generateTxJsonObj,
    InjectiveTx,
    writeTxJsonOutput
} from "./transaction";
import fs from "fs";
import {sha256} from "@injectivelabs/sdk-ts";
import {BigNumberInBase} from "@injectivelabs/utils";
import path from "node:path";
import {replaceLineEndingsWithBreaks, replaceLineEndingsWithSlashN} from "./deploy";
import {pathsDeploy, pathsDeployArtifacts} from "./context";
import * as zlib from "node:zlib";


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
    proposerAddress: t.string,
    instantiateAddresses: t.union([t.array(t.string), t.undefined, t.null]),
    depositAmountINJ: t.number,
    note: t.union([t.string, t.undefined, t.null]),
}, "GovPropSpec"));

interface GovPropOutput {
    txJsonPath: string;
}

type GovPropSpec = t.TypeOf<typeof govPropSpecDef>;
interface GovPropContext extends TxContext<GovPropSpec,GovPropOutput> {}

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

export async function govProp(specPath: string, remainingArgs: string[]) {
    console.log("Creating governance proposal transaction...");
    console.log("");

    const output: GovPropOutput = {
        txJsonPath: ""
    };
    let context: GovPropContext = createTxContext(specPath, govPropSpecDef, output, "gov-prop");

    console.log(`Contract variant: ${context.spec.contractVariant}`);
    console.log("");

    const wasmPath = path.join(pathsDeploy, context.spec.wasmPath);

    if (!fs.existsSync(wasmPath)) {
        throw new DeployError("InputError", "Wasm file does not exist: " + wasmPath);
    }

    console.log(`Checksum for ${context.spec.contractVariant}: ${context.spec.wasmChecksum}`);
    const wasmContents = fs.readFileSync(wasmPath);
    const generatedChecksum = Buffer.from(sha256(wasmContents));
    const generatedChecksumString = generatedChecksum.toString('hex');
    console.log(`Generated Checksum for ${context.spec.contractVariant}: ${generatedChecksumString}`);
    if (generatedChecksumString != context.spec.wasmChecksum) {
        throw new DeployError("InputError", `Wasm checksum does not match for: ${context.spec.contractVariant}`);
    }

    //const gasPrices = context.gasPricesAmountWei.toFixed();
    //const gas = new BigNumberInWei(60000000).toFixed();
    const despositAmountInBaseInj = context.spec.depositAmountINJ;
    const despositAmountInWei = new BigNumberInBase(despositAmountInBaseInj).toWei().toFixed();




    const relativeSummaryFilePath = context.spec.summaryFilePath;
    const summaryFilePath = path.join(pathsDeploy, relativeSummaryFilePath);
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