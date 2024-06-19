import path from "node:path";
import fs from "fs";
import {createContext, DeployContext, DeploySpec, pathsDeployArtifacts} from "./context";
import * as t from "io-ts";
import {BigNumberInBase} from "@injectivelabs/utils";
import {DeployError} from "./error";

type ContractVariant = "Minter" | "Collection";

// Properties that must be in all generate specs (currently all specs)
export interface TxSpec extends DeploySpec {
    node?: string | null;
    contractVariant?: ContractVariant | null;
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

export interface TxContext<S extends TxSpec> extends DeployContext<S> {
    chainId: ChainId;
    node: string;
    gas: GasOptions;
    txName: string;
}

export function createTxContext<
    S extends TxSpec,
>(
    specPath: string,
    specDef: t.Decoder<unknown, S>,
    txName: string,
): TxContext<S> {
    const deployContext = createContext(specPath, specDef);
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


export function writeTxJsonOutput<
    T,
    S extends TxSpec,
>(context: TxContext<S>, txObj: InjectiveTx<T>) {

    let outputJsonTxFilepath =
        path.join(pathsDeployArtifacts, context.txName + "-tx_");

    if (context.spec.contractVariant) {
        outputJsonTxFilepath += "dega-" + context.spec.contractVariant.toLowerCase() + "_";
    }

    outputJsonTxFilepath += context.spec.network.toString().toLowerCase();
    outputJsonTxFilepath += ".json";

    console.log("Formatted Tx JSON File: " + outputJsonTxFilepath);

    fs.writeFileSync(outputJsonTxFilepath, JSON.stringify(txObj, null, 2));
}