import fs from "fs";
import path from "node:path";
import {isLeft} from "fp-ts/Either";
import util from "util";
import { instantiate } from "./instantiate";
import { govProp } from "./gov-prop";
import {sign} from "./sign-new";

// Used for a hard fatal error, often with the logic in the script or some bad state
class ScriptError {
    constructor(message: string) {
        this.message = `Deploy Script Error: ${message}`;
    }

    message: string
}

// Used for a soft error such as bad calling semantics
class InputError {
    constructor(message: string) {
        const usage = "Usage: node deploy.js <command> <signing-info-spec-path>";
        this.message = message + ". " + usage;
    }

    message: string
}

function main() {

    (async () => {

        try {
            await runMain()
        } catch (e) {

            let errorCode;
            const isInputError = e instanceof InputError;
            const isScriptError = e instanceof ScriptError;

            if (isInputError || isScriptError) {
                console.log("");
                console.error(e.message);
                console.log("");
            } else {
                console.error(e);
            }

            if (isInputError) {
                errorCode = 1;
            } else if (isScriptError) {
                errorCode = 2;
            } else {
                errorCode = 3;
            }

            //fs.writeFileSync(pathsErrorFile, util.inspect(e))

            process.exit(errorCode);
        }

    })()
}

async function runMain() {

    let args = new Array<string>()

    // Find the index of the argument containing the filename
    let filenameIndex = process.argv.findIndex(arg => arg.includes('deploy-new.js'))
    if (filenameIndex !== -1) {
        // Get all the remaining arguments after the filename

        args = process.argv.slice(filenameIndex + 1)

    } else {
        throw new ScriptError("Improper calling semantics - missing script name argument");
    }



    const command = args.shift();
    if (!command) {
        throw new InputError(`Missing deploy command`);
    }

    const specPathArg = args.shift();
    if (!specPathArg) {
        throw new InputError(`Missing deploy spec path argument`);
    }

    if (args.length > 1) {
        throw new InputError(`Extra arguments`);
    }

    const working_dir = process.cwd();
    const specPath = path.resolve(working_dir, specPathArg);
    console.log('Signing info spec path: ' + specPath);

    switch (command) {
        case "instantiate":
            await instantiate(specPath, args);
            break;
        case "gov-prop":
            await govProp(specPath, args);
            break;
        case "migrate":
            await govProp(specPath, args);
            break;
        case "sign":
            await sign(specPath, args);
            break;
        default:
            throw new InputError(`Invalid command: ${command}`);
    }
}
