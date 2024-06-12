#!/usr/bin/env node

import fs from "fs";
import path from "node:path";
import {isLeft} from "fp-ts/Either";
import util from "util";
import {getInstantiateCommand, instantiate} from "./instantiate";
import {getGovPropCommand, govProp} from "./gov-prop";
import {getSignCommand, sign} from "./sign";
import {pathsDeployArtifacts, pathsWorkspace} from "./context";
import {DeployError, handleError} from "./error";
import {execSync} from "child_process";
import {getMigrateCommand, migrate} from "./migrate";
import * as t from "io-ts";
import {Props} from "io-ts";
import {setUsageCommand, showCommandHelp, showGeneralHelp, showHelpHelp} from "./help";


export interface CommandInfo {
    name: string;
    summary: string;
    additionalUsage: string;
    run?: (specPath: string, remainingArgs: string[]) => Promise<void>;
    specHelp?: string;
}

let commandList: CommandInfo[] = [];

export function getCommandList() {
    return commandList;
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

    if (process.argv.find((arg) => arg.includes("dega-inj-deploy"))) {
        // Removes the following warning that is pulled in by the injective library via ethers.js:
        //      (node:2954537) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
        //      (Use `node --trace-deprecation ...` to show where the warning was created)
        // We mantain the warning when running via node directly rather than the dega-inj-deploy script
        process.removeAllListeners('warning');
    }

    commandList.push(getGovPropCommand());
    commandList.push(getInstantiateCommand());
    commandList.push(getMigrateCommand());
    commandList.push(getSignCommand());


    // Strip the first two arguments
    let args = process.argv.slice(2);

    const makeFilePath = path.join(pathsWorkspace, "Makefile.toml")

    if (!(fs.existsSync(makeFilePath))) {
        throw new Error("Not in correct directory. Deploy script must be run from deploy-tool/dist" +
            "directory relative to the workspace root.")
    }

    let showHelp = false;

    if (args.length) {
        let helpSearchIndex = args.length;
        while (helpSearchIndex--) {
            const argToCheck = args[helpSearchIndex];
            if (argToCheck == "--help" || argToCheck == "-h") {
                args.splice(helpSearchIndex, 1);
                if (!showHelp) {
                    showHelp = true;
                }
            }
        }
    }

    let commandName = args.shift();

    if (commandName && commandName == "help") {
        // Consume help command and check for remaining specific command / subcommand to get help on
        commandName = args.shift();
        showHelp = true;
    }

    if (commandName === "help") {
        showHelpHelp();
    } else if (commandName) {

        let command = commandList.find((command) => {
            return command.name === commandName;
        });

        if (command) {
            setUsageCommand(command);

            if (showHelp) {
                showCommandHelp(command);
            } else if (command.run) {

                const specPathArg = args.shift();
                if (!specPathArg) {
                    throw new DeployError("UsageError", `Missing deploy spec path argument`);
                }

                const specPath = path.resolve(process.cwd(), specPathArg);

                console.log('Signing info spec path: ' + specPath);
                console.log("");

                if (!fs.existsSync(pathsDeployArtifacts)) {
                    fs.mkdirSync(pathsDeployArtifacts);
                } else if (fs.readdirSync(pathsDeployArtifacts).length && commandName !== "sign") {
                    execSync(`rm ${pathsDeployArtifacts}/*`, {encoding: 'utf-8'})
                }

                await command.run(specPath, args);
            }
        } else if (showHelp) {
            showGeneralHelp();
        } else {
            throw new DeployError("UsageError", "Unknown command: " + commandName);
        }
    } else if (showHelp) {
        showGeneralHelp();
    } else {
        throw new DeployError("UsageError", "Missing command");
    }

}

if (require.main === module) {
    main()
}