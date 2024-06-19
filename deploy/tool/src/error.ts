import {getUsage, getUsageSuggestion} from "./help";

export type DeployErrorType = "UsageError" | "InputError" | "ScriptError" | "DecodeError"

export class DeployError {
    constructor(type : DeployErrorType, message: string) {
        this.message = message
        this.err_type = type
    }

    message: string;
    err_type: DeployErrorType;
}

export function handleError(e: unknown) {
    let errorCode;

    if (e instanceof DeployError) {

        console.error("");
        console.error(`   ${e.err_type}: ${e.message}`);
        if (e.err_type == "UsageError") {
            console.error("");
            console.error("   Usage:");
            console.error("      " + getUsage());

            const usageSuggestion = getUsageSuggestion();
            if (usageSuggestion) {
                console.error("");
                console.error("      " + usageSuggestion);
            }
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