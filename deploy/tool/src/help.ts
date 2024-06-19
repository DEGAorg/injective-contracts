import {CommandInfo, getCommandList} from "./main";
import * as t from "io-ts";


let usageCommand = "<command>"
let usageSuggestion = "Run 'dega-inj-deploy help' for a list of commands";
let additionalUsage: string | undefined = "<spec-file> [args]";
const mainDescription = "A deployment tool for generating and signing JSON transactions for the DEGA " +
    "smart contracts on Injective."
const helpUsage = "dega-inj-deploy help [<command>]";
const helpDescription = "Show help for a specific command or sub-command.";

export function setUsageCommand<C extends t.InterfaceType<t.Props>>(command: CommandInfo) {
    usageCommand = command.name;
    additionalUsage = command.additionalUsage;
    usageSuggestion = "";
}

export function getUsageCommand() {
    return usageCommand;
}

export function getUsage() {
    let output = `dega-inj-test ${usageCommand}`;
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

    let commandList = getCommandList();
    commandList.push({
        name: "help",
        summary: helpDescription,
        additionalUsage: "",
    });

    if (commandList.length) {
        const summaryOffset = 25;
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

export function showCommandHelp<C extends t.InterfaceType<t.Props>>(commandInfo: CommandInfo) {
    console.log("");
    console.log(`   ${commandInfo.summary}`);
    console.log("");
    console.log("   Usage:")
    console.log(`      ${getUsage()}`);
    console.log("");

    if (commandInfo.specHelp) {
        console.log("   Spec File Properties:");
        console.log("");
        console.log(commandInfo.specHelp);
    }
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

export function makeSpecHelp<C extends t.InterfaceType<t.Props>>(specDef: C) {
    let specHelp = ""
    const summaryOffset = 30;
    for (let key in specDef.props) {
        let padding = "";
        if (key.length < summaryOffset) {
            padding = " ".repeat(summaryOffset - key.length);
        } else {
            padding = "\n" + " ".repeat(summaryOffset + 8);
        }
        let prop = specDef.props[key];
        specHelp += `      ${key}: ${padding}${prop.name}\n`;
    }
    return specHelp;
}