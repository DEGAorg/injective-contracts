import {getUsage, getUsageSuggestion} from "./help";

export class ScriptError {
    constructor(message: string) {
        this.message = "ScriptError: " + message
    }

    message: string;
}

export class UsageError {
    constructor(message: string) {
        this.message = "UsageError: " + message
    }

    message: string;
}


export function handleError(e: unknown) {
    let errorCode;

    if (e instanceof ScriptError || e instanceof UsageError) {

        console.error("");
        console.error("   " + e.message);
        if (e instanceof UsageError) {

            console.error("");
            console.error("      Usage: " + getUsage());

            const usageSuggestion = getUsageSuggestion();
            if (usageSuggestion) {
                console.error("");
                console.error("      " + usageSuggestion);
            }
        }
        console.error("");

    } else {
        errorCode = 1;
        console.error(e);
    }

    process.exit(errorCode);
}