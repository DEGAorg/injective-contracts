#!/usr/bin/env node

import {generate} from "./generate";
import {getQueryCommand, query} from "./query";
import {getTxCommand, tx} from "./tx";
import {getToolsCommand, tools} from "./tools";
import {contextSetShowHelpFlag, getAppContext} from "./context";
import {Config} from "./config";
import {toBase64} from "@injectivelabs/sdk-ts";
import {handleError, ScriptError, UsageError} from "./error";
import {setUsageCommand, setUsageSubCommand, showCommandHelp, showGeneralHelp, showSubCommandHelp} from "./help";

export interface CommandInfo {
    name: string;
    summary: string;
    aliases: string[];
    subCommands: SubCommandInfo[];
}

export interface SubCommandInfo {
    name: string;
    summary: string;
    additionalUsage: string;
    run: (args: string[]) => Promise<void>;
}



async function runMain() {

    if (process.argv.find((arg) => arg.includes("dega-inj-test"))) {
        // Removes the following warning that is pulled in by the injective library via ethers.js:
        //      (node:2954537) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
        //      (Use `node --trace-deprecation ...` to show where the warning was created)
        // We mantain the warning when running via node directly rather than the dega-inj-test script
        process.removeAllListeners('warning');
    }

    let commandList: CommandInfo[] = [];
    commandList.push(getQueryCommand());
    commandList.push(getTxCommand());
    commandList.push(getToolsCommand());

    await getAppContext();

    // Strip the first two arguments
    let args = process.argv.slice(2);

    let commandName = args.shift();
    let showHelp = false;

    if (commandName && commandName == "help") {
        // Consume help command and check for remaining specific command / subcommand to get help on
        commandName = args.shift();
        showHelp = true;
    }

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

    if (commandName) {

        let command = commandList.find((command) => {
            return command.name === commandName || command.aliases.includes(commandName);
        });

        if (command) {
            setUsageCommand(commandName);
            let subCommandName = args.shift();
            if (subCommandName) {
                let subCommand =
                    command.subCommands.find((subCommand) => {
                        return subCommand.name === subCommandName;
                    });
                if (subCommand) {
                    setUsageSubCommand(subCommand);
                    if (showHelp) {
                        showSubCommandHelp(command, subCommand);
                    } else {
                        await subCommand.run(args);
                    }

                } else {
                    throw new UsageError("Unknown sub-command: " + subCommandName);
                }
            } else if (showHelp) {
                showCommandHelp(command);
            } else {
                throw new UsageError("Missing sub-command");
            }
        } else {
            throw new UsageError("Unknown command: " + commandName);
        }
    } else if (showHelp) {
        showGeneralHelp();
    } else {
        throw new UsageError("Missing command");
    }

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

if (require.main === module) {
    main();
}
