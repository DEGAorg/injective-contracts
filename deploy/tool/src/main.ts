#!/usr/bin/env node

import fs from "fs";
import path from "node:path";
import {isLeft} from "fp-ts/Either";
import util from "util";
import { instantiate } from "./instantiate";
import { govProp } from "./gov-prop";
import {sign} from "./sign";
import {pathsDeployArtifacts, pathsWorkspace} from "./context";
import {DeployError} from "./error";
import {execSync} from "child_process";
import {migrate} from "./migrate";

let usage = "Usage: node deploy.js <command> <signing-info-spec-path>";
let usageCommand = "<command>"
let additionalUsage = "";

export function addUsage(newUsage: string) {
    if (additionalUsage) {
        additionalUsage += newUsage;
    } else {
        additionalUsage += " " + newUsage;
    }
}

export function getUsageCommand() {
    return usageCommand;
}

function getUsage() {
    let output = `Usage: node deploy.js ${usageCommand} <signing-info-spec-path>`;
    if (additionalUsage) {
        output += " " + additionalUsage;
    }
    return output;
}

function handleError(e: unknown) {
    let errorCode;

    if (e instanceof DeployError) {

        console.error("");
        console.error(`${e.err_type}: ${e.message}`);
        if (e.err_type == "UsageError") {
            console.error("");
            console.error(getUsage());
        }
        console.error("");
        switch (e.err_type) {
            case "ScriptError":
                errorCode = 2;
                break;
            case "UsageError":
                errorCode = 3;
                break;
            case "InputError":
                errorCode = 4;
                break;
            case "DecodeError":
                errorCode = 5;
                break;
            default:
                errorCode = 1;
                console.error(`Unknown error type: ${e.err_type}`);
                console.error("");
                break;
        }
    } else {
        errorCode = 1;
        console.error(e);
    }

    //fs.writeFileSync(pathsErrorFile, util.inspect(e))

    process.exit(errorCode);
}

function main() {

    (async () => {

        try {
            await runMain()
        } catch (e) {
            handleError(e);
        }

    })()
}

async function runMain() {

    let args = new Array<string>()

    // Find the index of the argument containing the filename
    let filenameIndex = process.argv.findIndex(arg => {
        return arg.includes('main.js') || arg.includes('dega-inj-deploy');
    })
    if (filenameIndex !== -1) {
        // Get all the remaining arguments after the filename

        args = process.argv.slice(filenameIndex + 1)

    } else {
        throw new DeployError("UsageError", "Improper calling semantics - missing script name argument");
    }

    const makeFilePath = path.join(pathsWorkspace, "Makefile.toml")

    if (!(fs.existsSync(makeFilePath))) {
        throw new Error("Not in correct directory. Deploy script must be run from deploy-tool/dist" +
            "directory relative to the workspace root.")
    }

    const command = args.shift();
    if (!command) {
        throw new DeployError("UsageError", `Missing deploy command`);
    }

    const specPathArg = args.shift();
    if (!specPathArg) {
        throw new DeployError("UsageError", `Missing deploy spec path argument`);
    }

    const specPath = path.resolve(process.cwd(), specPathArg);

    console.log('Signing info spec path: ' + specPath);
    console.log("");
    usageCommand = command;

    if (!fs.existsSync(pathsDeployArtifacts)) {
        fs.mkdirSync(pathsDeployArtifacts);
    } else if (fs.readdirSync(pathsDeployArtifacts).length && command !== "sign") {
        execSync(`rm ${pathsDeployArtifacts}/*`, {encoding: 'utf-8'})
    }

    switch (command) {
        case "instantiate":
            await instantiate(specPath, args);
            break;
        case "gov-prop":
            await govProp(specPath, args);
            break;
        case "migrate":
            await migrate(specPath, args);
            break;
        case "sign":
            await sign(specPath, args);
            break;
        default:
            throw new DeployError("UsageError", `Invalid command: ${command}`);
    }
}

if (require.main === module) {
    main()
}