import fs from "fs";
import * as t from "io-ts";
import path from "node:path";
import util from "util";
import {isLeft} from "fp-ts/Either";
import {failure} from "io-ts/PathReporter";
import {DeployError} from "./error";
import {getUsageCommand} from "./main";

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
    network: "Local" | "Testnet" | "Mainnet";
}

// Properties that must be in every output
export interface DeployOutput {
}


export interface DeployContext<S extends DeploySpec, O extends DeployOutput> {
    spec: S;
    output: O;
}

export function decode<I, A>(type: t.Decoder<I, A>, input: I) {
    const result = type.decode(input)
    if (isLeft(result)) {
        const errors = result.left;
        const errorDetails = failure(errors)
            .map(s => {
                const excessPropIndex = s.search("excess properties");
                if (excessPropIndex != -1) {
                    s = s.slice(excessPropIndex)
                }
                return '- ' + s
            })
            .join('\n');

        const errorMsg =
            `Validation failed for input:

${JSON.stringify(input, null, 2)}

Error details:

${errorDetails}
`;

        throw new DeployError("DecodeError", errorMsg);
    }

    return result.right;
}

function loadSpec<I, S extends DeploySpec>(specPath: string, specDef: t.Decoder<I, S>): S {

    const fileContents = fs.readFileSync(specPath, 'utf-8')
    const jsonData = JSON.parse(fileContents)
    try {
        return decode(specDef, jsonData);
    } catch (e) {
        if (e instanceof DeployError) {
            throw new DeployError("InputError", `Invalid spec file for ${getUsageCommand()} command: ${specPath}\n\n${e.message}`);
        } else {
            throw e;
        }
    }
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

export function logObjectFullDepth(obj: any) {
    console.log(util.inspect(obj, {showHidden: false, depth: null, colors: true}));
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
    let result = input.replace(/\r\n/g, '\n');

    // Replace Unix-style line endings
    result = result.replace(/\n/g, '\n');

    return result;
}

export function getFilePathFromSpecFile(pathString: string) {
    let preResolvePath;
    let workspaceTag = "<workspace>/";
    let deployTag = "<deploy>/";

    if (pathString.startsWith(workspaceTag)) {
        preResolvePath = pathsWorkspace + pathString.slice(workspaceTag.length - 1);
    } else if (pathString.startsWith("<deploy>/")) {
        preResolvePath = pathsDeploy + pathString.slice(deployTag.length - 1);
    } else if (pathString.startsWith("/")) {
        preResolvePath = pathString;
    } else {
        throw new DeployError("InputError", `Invalid path found in spacefile: ${pathString}\n\nPath must start with "<workspace>/" or "<deploy>/" or the root "/"`);
    }

    const filePath = path.resolve(preResolvePath);

    if (!fs.existsSync(filePath)) {
        throw new DeployError("InputError", `File at path specified in spec file does not exist: ${filePath}`);
    }

    return filePath;
}