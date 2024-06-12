import {CommandInfo, getCommandInfo, SubCommandInfo} from "./main";

let usageCommand = "<command>"
let usageSubCommand = "<subcommand>"
let usageSuggestion = "Run 'dega-inj-test help' for a list of commands";
let additionalUsage: string | undefined = "[args]";
const mainDescription = "A test tool for interacting with Intective-based Networks and DEGA " +
    "Smart Contracts deployed on them."
const helpUsage = "dega-inj-test help [<command> [<subcommand>]]";
const helpDescription = "Show help for a specific command or sub-command.";

export function setUsageCommand(commandName: string) {
    usageCommand = commandName;
    usageSuggestion = `Run 'dega-inj-test help ${usageCommand}' for a list of subcommands.`;
}

export function setUsageSubCommand(subCommand: SubCommandInfo) {
    usageSubCommand = subCommand.name;
    additionalUsage = subCommand.additionalUsage;
    usageSuggestion = "";
}

export function getUsage() {
    let output = `dega-inj-test ${usageCommand} ${usageSubCommand}`;
    if (additionalUsage) {
        output += " " + additionalUsage;
    }
    return output;
}

export function getUsageSuggestion() {
    return usageSuggestion;
}

export function showGeneralHelp() {
    console.log("");
    console.log(`   ${mainDescription}`);
    console.log("");
    console.log("   Usage:")
    console.log(`      ${getUsage()}`);
    console.log("");

    const summaryOffset = 25;
    let commandList = getCommandInfo();
    commandList.push({
        name: "help",
        summary: helpDescription,
        aliases: [],
        subCommands: []
    })
    if (commandList.length) {
        console.log("   Commands:");
        for (let command of commandList) {
            let padding = "";
            if (command.name.length < summaryOffset) {
                padding = " ".repeat(summaryOffset - command.name.length);
            }
            console.log(`      ${command.name}${padding} - ${command.summary}`);
        }
        console.log("")
    }
}

export function showCommandHelp(commandInfo: CommandInfo) {
    console.log("");
    console.log(`   ${commandInfo.summary}`);
    console.log("");
    console.log("   Usage:")
    console.log(`      ${getUsage()}`);
    console.log("");

    if (commandInfo.aliases.length) {
        console.log("   Aliases:");
        console.log(`      ${commandInfo.aliases.join(", ")}`);
        console.log("");
    }

    const summaryOffset = 25;
    if (commandInfo.subCommands.length) {
        console.log("   Subcommands:");
        for (let subCommand of commandInfo.subCommands) {
            let padding = "";
            if (subCommand.name.length < summaryOffset) {
                padding = " ".repeat(summaryOffset - subCommand.name.length);
            }
            console.log(`      ${subCommand.name}${padding} - ${subCommand.summary}`);
        }
        console.log("");
    }
}

export function showSubCommandHelp(commandInfo: CommandInfo, subCommandInfo: SubCommandInfo) {
    console.log("");
    console.log(`   ${subCommandInfo.summary}`);
    console.log("");
    console.log("   Usage:");
    console.log(`      ${getUsage()}`);
    console.log("");
}

export function showHelpHelp() {
    console.log("");
    console.log("   Usage:");
    console.log(`      ${helpUsage}`);
    console.log("");
    console.log("   Description:");
    console.log(`      ${helpDescription}`);
    console.log("");
}