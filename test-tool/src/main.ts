#!/usr/bin/env node

import {getQueryCommand, query} from "./query";
import {getTxCommand} from "./tx";
import {getToolsCommand} from "./tools";
import {getAppContext} from "./context";
import {handleError, UsageError} from "./error";
import {
    setUsageCommand,
    setUsageSubCommand,
    showCommandHelp,
    showGeneralHelp,
    showHelpHelp,
    showSubCommandHelp
} from "./help";

let commandList: CommandInfo[] = [];

export function getCommandInfo() {
    return commandList;
}

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


    commandList.push(getQueryCommand());
    commandList.push(getTxCommand());
    commandList.push(getToolsCommand());

    await getAppContext();

    // Strip the first two arguments
    let args = process.argv.slice(2);

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
            return command.name === commandName || command.aliases.includes(commandName);
        });

        if (command) {
            setUsageCommand(command.name);
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
