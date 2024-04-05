import {generate} from "./generate";
import {query} from "./query";
import {tx} from "./tx";
import {Context} from "./context";
import {Config} from "./config";
import {BigNumberInBase} from "@injectivelabs/utils";
import {toBase64} from "@injectivelabs/sdk-ts";


function main() {

    console.log("Network: " + Config.NETWORK);
    console.log("Minter Address: " + Config.MINTER_ADDRESS);
    console.log("CW721 Address: " + Config.CW721_ADDRESS);
    console.log("Primary Address: " + Context.primaryAddress);
    console.log("Signer Address: " + Context.signerAddress);
    console.log("Local Genesis Address: " + Context.localGenesisAddress);

    (async () => {

        let command = "query"; // default to query
        let args = new Array<string>();
        // Find the index of the argument containing the filename
        let filenameIndex = process.argv.findIndex(arg => arg.includes('test.js'));
        if (filenameIndex !== -1) {
            // Get all the remaining arguments after the filename
            args = process.argv.slice(filenameIndex + 1);
            let shift_result = args.shift();
            if (shift_result != undefined) {
                command = shift_result;
            }
        }

        console.log("test command: " + command);
        console.log("test args: " + args);

        switch (command) {
            case "query":
            case "q":
                await query(args);
                break;
            case "tx":
                await tx(args);
                break;
            case "generate":
            case "g":
                await generate(args);
                break;
            case "make-sig":
                await generate(args);
                break;
            default:
                console.log("Unknown command: " + command);
                break;
        }

    })();
}

main();



async function makeSig(message: string) {
    let mintRequestBase64 = toBase64({message});
    let buffer = Buffer.from(mintRequestBase64, "base64");
    //let uint8Array = new Uint8Array(buffer);

    const signature = await Context.signerPrivateKey.sign(buffer);
    let sigBase64 = toBase64(signature);

    console.log("Signature:");
    console.log(sigBase64);
}