import fs from "fs";
import {decode} from "./deploy";
import * as t from "io-ts";
import path from "node:path";

export const pathsWorkspace = path.resolve(__dirname, "../../..")
export const pathsWorkspaceArtifacts = path.join(pathsWorkspace, "artifacts")
export const pathsWorkspaceArtifactsOptimized = path.join(pathsWorkspace, "artifacts-optimized")
export const pathsDeploy = path.join(pathsWorkspace, "deploy")
export const pathsDeployArtifacts = path.join(pathsDeploy, "artifacts")
export const pathsDeploySpecs = path.join(pathsDeploy, "specs")
export const pathsDeployPrivateKeys = path.join(pathsDeploy, "private-keys")
export const pathsOutputFile = path.join(pathsDeployArtifacts, 'deploy-output.json')
export const pathsLogFile = path.join(pathsDeployArtifacts, 'deploy-log.txt')
export const pathsErrorFile = path.join(pathsDeployArtifacts, 'deploy-error.txt')

// Properties that must be in every spec
export interface DeploySpec {
    deployAddress: string;
    network: "Local" | "Testnet" | "Mainnet";
}

// Properties that must be in every output
export interface DeployOutput {
}


export interface DeployContext<S extends DeploySpec, O extends DeployOutput> {
    spec: S;
    output: O;
}

function loadSpec<I, S extends DeploySpec>(specPath: string, specDef: t.Decoder<I, S>): S {

    const fileContents = fs.readFileSync(specPath, 'utf-8')
    const jsonData = JSON.parse(fileContents)
    return decode(specDef, jsonData)
}

export function createContext
<S extends DeploySpec, O extends DeployOutput>
(
    specPath: string,
    specDef: t.Decoder<unknown, S>,
    newOutput: O
): DeployContext<S, O> {
    return {
        spec: loadSpec(specPath, specDef),
        output: newOutput
    }
}