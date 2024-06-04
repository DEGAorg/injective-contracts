import {generate} from "./generate";
import {query} from "./query";
import {tx} from "./tx";
import {getAppContext} from "./context";
import {Config} from "./config";
import {toBase64} from "@injectivelabs/sdk-ts";


function main() {

    (async () => {

        const context = await getAppContext();

        console.log("Network: " + Config.NETWORK);
        console.log("Minter Address: " + context.minterAddress);
        console.log("CW721 Address: " + context.cw721Address);
        console.log("Primary Address: " + context.primaryAddress);
        console.log("Signer Address: " + context.signerAddress);
        console.log("Signer Compressed Pubkey Base64: " + context.signerCompressedPublicKey.toString('base64'));
        console.log("Local Genesis Address: " + context.localGenesisAddress);


        let command: string | null = null; // default to query
        let args = new Array<string>();
        // Find the index of the argument containing the filename
        let filenameIndex = process.argv.findIndex(arg => arg.includes('main.js'));
        if (filenameIndex !== -1) {
            // Get all the remaining arguments after the filename
            args = process.argv.slice(filenameIndex + 1);
            let shift_result = args.shift();
            if (shift_result != undefined) {
                command = shift_result;
            }
        }

        if (command == null) {
            return;
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

if (require.main === module) {
    main();
}



async function makeSig(message: string) {

    const context = await getAppContext();

    let mintRequestBase64 = toBase64({message});
    let buffer = Buffer.from(mintRequestBase64, "base64");
    //let uint8Array = new Uint8Array(buffer);

    const signature = await context.signerPrivateKey.sign(buffer);
    let sigBase64 = toBase64(signature);

    console.log("Signature:");
    console.log(sigBase64);
}
