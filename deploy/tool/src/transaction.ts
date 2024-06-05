import {execSync} from "child_process";
import path from "node:path";
import fs from "fs";
import {logObjectFullDepth} from "./deploy";
import {createContext, DeployContext, DeployOutput, DeploySpec, pathsDeployArtifacts} from "./context";
import * as t from "io-ts";
import {BigNumberInBase} from "@injectivelabs/utils";

type ContractVariant = "Minter" | "Collection";

// Properties that must be in all generate specs (currently all specs)
export interface TxSpec extends DeploySpec {
    node?: string | null;
    contractVariant?: ContractVariant | null;
}

// Properties that must be in all generate outputs (currently all specs)
export interface TxOutput extends DeployOutput {
    txJsonPath: string;
}

export interface InjectiveTx<T> {
    body: {
        messages: T[];
        memo: string;
        timeout_height: string;
        extension_options: {}[];
        non_critical_extension_options: {}[];
    };
    auth_info: {
        signer_infos: {}[];
        fee: {
            amount: {
                denom: string;
                amount: string;
            }[];
            gas_limit: string;
        };
    };
    signatures: string[];
}

type ChainId = "injective-1" | "injective-888";
type GasOptions = "auto" | BigNumberInBase;

export interface TxContext<S extends TxSpec, O extends TxOutput> extends DeployContext<S, O> {
    chainId: ChainId;
    node: string;
    gas: GasOptions;
    txName: string;
}

export function createTxContext<
    S extends TxSpec,
    O extends TxOutput,
>(
    specPath: string,
    specDef: t.Decoder<unknown, S>,
    newOutput: O,
    txName: string,
): TxContext<S,O> {
    const deployContext = createContext(specPath, specDef, newOutput);
    let chainId: ChainId;
    switch (deployContext.spec.network) {
        case "Local":
            chainId = "injective-1";
            break;
        case "Testnet":
            chainId = "injective-888";
            break;
        case "Mainnet":
            chainId = "injective-1";
            break;
        default:
            throw new DeployError("ScriptError", `Unknown network: ${deployContext.spec.network}`);
    }
    let node: string;
    if (deployContext.spec.node) {
        node = deployContext.spec.node;
    } else {
        switch (deployContext.spec.network) {
            case "Local":
                node = "http://localhost:26657";
                break;
            case "Testnet":
                node = "https://testnet.sentry.tm.injective.network:443";
                break;
            case "Mainnet":
                node = "https://sentry.tm.injective.network:443";
                break;
            default:
                throw new DeployError("ScriptError", `Unknown network: ${deployContext.spec.network}`);
        }
    }

    return {
        ...deployContext,
        chainId: chainId,
        node: node,
        gas: "auto",
        txName: txName,
    };
}


export async function generateTxJsonObj<
    T,
    S extends TxSpec,
    O extends TxOutput,
>(context: TxContext<S,O>, txArgs: string[]): Promise<InjectiveTx<T>> {

    console.log("Generating transaction");
    console.log("");

    let baseTxArgs = [];
    baseTxArgs.push("injectived");
    baseTxArgs.push("tx");

    baseTxArgs.concat(txArgs);

    baseTxArgs.push(`--chain-id="${context.chainId}"`);
    baseTxArgs.push(`--from=${context.spec.deployAddress}`);
    baseTxArgs.push(`--node=${context.node}`);
    baseTxArgs.push(`--generate-only`);

    if (context.gas === "auto") {
        baseTxArgs.push(`--gas=auto`);
        baseTxArgs.push(`--gas-adjustment=1.4`);
    } else {
        baseTxArgs.push(`--gas=${context.gas.toString()}`);
    }

    baseTxArgs.push(`--gas-prices=500000000inj`);

    console.log("Base CLI Tx:");
    console.log(baseTxArgs.join(" "));

    const injectivedPassword = process.env.INJECTIVED_PASSWORD;
    if (injectivedPassword == null) {
        throw new DeployError("InputError", "Must specify INJECTIVED_PASSWORD in environment to generate transactions");
    }

    let fullTxArgs = [];
    fullTxArgs.push("echo");
    fullTxArgs.push(`${injectivedPassword}`);
    fullTxArgs.push(`|`);
    fullTxArgs = fullTxArgs.concat(baseTxArgs);

    //const txJsonStringUnformatted = await run(context, "injectived", generateTxArgs);
    const txJsonStringGenerated = execSync(fullTxArgs.join(" "), { encoding: 'utf-8' });

    console.log("Generated Tx:");
    console.log("================================================");
    logObjectFullDepth(txJsonStringGenerated);
    console.log("================================================");

    return JSON.parse(txJsonStringGenerated) as InjectiveTx<T>;
}

export function writeTxJsonOutput<
    T,
    S extends TxSpec,
    O extends TxOutput,
>(context: TxContext<S,O>, txObj: InjectiveTx<T>) {

    let outputJsonTxFilepath =
        path.join(pathsDeployArtifacts, context.txName + "-tx_");

    if (context.spec.contractVariant) {
        outputJsonTxFilepath += "dega-" + context.spec.contractVariant.toLowerCase() + "_";
    }

    outputJsonTxFilepath += context.spec.network.toString().toLowerCase();
    outputJsonTxFilepath += ".json";

    console.log("Formatted Tx JSON File: " + outputJsonTxFilepath);
    context.output.txJsonPath = outputJsonTxFilepath;

    fs.writeFileSync(outputJsonTxFilepath, JSON.stringify(txObj, null, 2));
}