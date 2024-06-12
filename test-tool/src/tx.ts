import {DegaCw721ExecuteMsg, DegaMinterExecuteMsg, DegaMinterInstantiateMsg, DegaMinterQueryMsg} from "./messages";
import {MintRequest} from "./messages/dega_minter_execute";
import {Config} from "./config";
import {getAppContext,} from "./context";
import {
    fromBase64,
    MsgExecuteContractCompat,
    MsgInstantiateContract,
    MsgMigrateContract,
    MsgSend,
    MsgStoreCode,
    sha256,
    toBase64,
    TxResponse,
} from "@injectivelabs/sdk-ts";
import {BigNumberInBase, BigNumberInWei} from '@injectivelabs/utils'
import {exec, execSync} from 'child_process';
import path from "node:path";
import fs from "fs";
import secp256k1 from "secp256k1";
import {SignerSourceTypeEnum} from "./messages/dega_minter_query";
import {v4 as uuidv4} from 'uuid';
import {DegaCw721MigrateMsg} from "./messages/dega_cw721_migrate";
import {DegaMinterMigrateMsg} from "./messages/dega_minter_migrate";
import {Convert, Cw721ReceiverTesterInnerMsg} from "./messages/cw721_receiver_tester_inner_msg";
import {Cw721ReceiveMsg, Cw721ReceiverTesterExecuteMsg} from "./messages/cw721_receiver_tester_execute_msg";
import {Expiration} from "./messages/dega_cw721_execute";
import {addAdmin, pause, removeAdmin, setMintSigner, updateCollectionInfo} from "./tx-admin";
import {ScriptError, UsageError} from "./error";
import {CommandInfo} from "./main";
import {
    escapeDoubleQuotes,
    replaceLineEndingsWithBreaks,
    replaceLineEndingsWithSlashN,
    replaceWithUnicode
} from "./tools";

let txCommand: CommandInfo = {
    name: "tx",
    aliases: ["transact", "run", "exec", "execute"],
    summary: "Broadcast transactions to the network and contracts specified in the environment.",
    subCommands: []
}

export function getTxCommand() {
    return txCommand;
}


async function sleep(seconds: number) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

export function logResponse(response: TxResponse) {

    if (response.code !== 0) {
        console.log(`Transaction failed: ${response.rawLog}`);
        throw new ScriptError("Transaction failed");
    } else {
        console.log("txHash: " + response.txHash);
        console.log("Logs:");
        console.log(response.logs);

        console.log("==========");
        console.log("==Events==");
        console.log("==========");

        if (response.events != null) {
            const eventsTyped = response.events as TxEvent[];

            let decoder = new TextDecoder();

            eventsTyped.forEach((event) => {

                if (event.type != null && event.attributes != null) {

                    const eventTypeString = "Event: " + event.type;
                    console.log()
                    console.log(eventTypeString);
                    console.log("-".repeat(eventTypeString.length));
                    event.attributes.forEach((attr) => {

                        if (attr.key != null && attr.value != null) {
                            console.log(decoder.decode(attr.key) + ": " + decoder.decode(attr.value));
                        }
                    });
                }
            });
        }
    }
}


txCommand.subCommands.push({
    name: "mint-combined",
    additionalUsage: "<receiver_address> <price>",
    summary: "Mints an NFT in one operation by playing the role of both the backend and the redeeming user.",
    run: mintCombined
});
async function mintCombined(args: string[]) {

    if (args.length < 2) {
        throw new UsageError("Invalid arguments.");
    }

    const context = await getAppContext();

    const receiverAddress = args[0];
    const priceString = args[1];

    let nftPriceBase = new BigNumberInBase(parseFloat(priceString));
    let nftPriceWei = nftPriceBase.toWei();

    const nowInSeconds: number = Math.floor(Date.now() / 1000);

    const startTimeInSeconds: number = nowInSeconds - 5; // 5 seconds ago
    //const startTimeInSeconds: number = nowInSeconds + 60; // 60 seconds from now (intentional error)

    const endTimeInSeconds: number = nowInSeconds + 60 * 5; // 5 minutes from now

    //const endTimeInSeconds: number = nowInSeconds + 8; // 8 seconds from now (intentional error)
    //await sleep(12); // wait 12 seconds

    let mintRequestMsg: MintRequest = {
        to: receiverAddress,
        primary_sale_recipient: context.primaryAddress,
        uri: "https://example.com",
        price: nftPriceWei.toFixed(),
        currency: "inj",
        //currency: "other",
        validity_start_timestamp: startTimeInSeconds.toString(),
        validity_end_timestamp: endTimeInSeconds.toString(),
        uuid: uuidv4(),
        //uuid: "8c288b70-dc7b-47d6-9412-1840f8c25a57"
        collection: context.cw721Address,
        //collection: "inj1n8n0p5l48g7xy9y7k4hu694jl4c82ej4mwqmfz"
    };

    //let rawTextMessage = "test message";
    //let rawMessage = Buffer.from(rawTextMessage, "utf-8");

    let rawMessage = Buffer.from(toBase64(mintRequestMsg), "base64")
    let msgMd5Hash = Buffer.from(sha256(rawMessage))
    let signingKey = context.signerSigningKey
    let signature = Buffer.from(secp256k1.ecdsaSign(msgMd5Hash, signingKey).signature)


    // Optional query to ensure signature is valid before issuing the mint command
    let checkSigQuery: DegaMinterQueryMsg = {
        check_sig: {
            message: {
                mint_request: mintRequestMsg
                //string: rawTextMessage // Uncomment to test with a string instead of the mint request
            },
            signature: signature.toString("base64"),
            signer_source: SignerSourceTypeEnum.ConfigSignerPubKey
            // Uncomment below to test validating with a local public key using on chain logic
            // signer_source: {
            //     pub_key_binary: Buffer.from(context.signerCompressedPublicKey).toString("base64")
            // }
        }
    };

    const checkSigQueryResponse =
        await context.queryWasmApi.fetchSmartContractState(
            context.minterAddress,
            toBase64(checkSigQuery));

    const checkSigQueryResponseObject: object = fromBase64(
        Buffer.from(checkSigQueryResponse.data).toString("base64")
    );

    console.log(checkSigQueryResponseObject);
    console.log();
    console.log("Test Query Locally Calculated Message Hash: " + msgMd5Hash.toString("hex"));

    let contractMsg: DegaMinterExecuteMsg = {
        mint: {
            request: mintRequestMsg,
            signature: signature.toString("base64")
        }
    }

    const execMsg = MsgExecuteContractCompat.fromJSON({
        sender: context.primaryAddress,
        contractAddress: context.minterAddress,
        msg: contractMsg,
        funds: [
            {
                denom: "inj",
                amount: nftPriceWei.toFixed()
                //amount: (nftPriceWei.plus(100)).toFixed() // slight overpayment
                //amount: (nftPriceWei.minus(100)).toFixed() // slight underpayment
            }
        ],
    })

    const response = await context.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: context.gasSettings,
    })

    logResponse(response);
}

txCommand.subCommands.push({
    name: "mint-as-backend",
    additionalUsage: "<receiver_address> <price>",
    summary: "Generates a mint signature in the fashion of the web-backend, that can then be minted with the mint-as-user sub-command.",
    run: mintAsBackend
});
async function mintAsBackend(args: string[]) {

    if (args.length < 2) {
        throw new UsageError("Missing argument.");
    }

    const context = await getAppContext();

    const receiverAddress = args[0];
    const priceString = args[1];

    let nftPriceBase = new BigNumberInBase(parseFloat(priceString));
    let nftPriceWei = nftPriceBase.toWei();

    const nowInSeconds: number = Math.floor(Date.now() / 1000);

    const startTimeInSeconds: number = nowInSeconds - 5; // 5 seconds ago
    //const startTimeInSeconds: number = nowInSeconds + 60; // 60 seconds from now (intentional error)

    const endTimeInSeconds: number = nowInSeconds + 60 * 5; // 5 minutes from now

    //const endTimeInSeconds: number = nowInSeconds + 8; // 8 seconds from now (intentional error)
    //await sleep(12); // wait 12 seconds

    let mintRequestMsg: MintRequest = {
        to: receiverAddress,
        primary_sale_recipient: context.primaryAddress,
        uri: "https://example.com",
        price: nftPriceWei.toFixed(),
        currency: "inj",
        //currency: "other",
        validity_start_timestamp: startTimeInSeconds.toString(),
        validity_end_timestamp: endTimeInSeconds.toString(),
        uuid: uuidv4(),
        //uuid: "8c288b70-dc7b-47d6-9412-1840f8c25a57"
        collection: context.cw721Address,
    };


    //let rawTextMessage = "test message";
    //let rawMessage = Buffer.from(rawTextMessage, "utf-8");

    const mintRequestBase64 = toBase64(mintRequestMsg);
    let rawMessage = Buffer.from(mintRequestBase64, "base64")
    let msgMd5Hash = Buffer.from(sha256(rawMessage))
    let signingKey = context.signerSigningKey
    let signature = Buffer.from(secp256k1.ecdsaSign(msgMd5Hash, signingKey).signature)


    // Optional query to ensure signature is valid before issuing the mint command
    const mintSignatureBase64 = signature.toString("base64");
    let checkSigQuery: DegaMinterQueryMsg = {
        check_sig: {
            message: {
                mint_request: mintRequestMsg
                //string: rawTextMessage // Uncomment to test with a string instead of the mint request
            },
            signature: mintSignatureBase64,
            signer_source: SignerSourceTypeEnum.ConfigSignerPubKey
            // Uncomment below to test validating with a local public key using on chain logic
            // signer_source: {
            //     pub_key_binary: Buffer.from(context.signerCompressedPublicKey).toString("base64")
            // }
        }
    };

    const checkSigQueryResponse =
        await context.queryWasmApi.fetchSmartContractState(
            context.minterAddress,
            toBase64(checkSigQuery));

    const checkSigQueryResponseObject: object = fromBase64(
        Buffer.from(checkSigQueryResponse.data).toString("base64")
    );

    console.log(checkSigQueryResponseObject);
    console.log();
    console.log("Test Query Locally Calculated Message Hash: " + msgMd5Hash.toString("hex"));

    const cacheDir = path.resolve(__dirname, "../cache");
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir);
    }

    const requestPath = path.resolve(cacheDir, "mint-request-base64.txt");
    fs.writeFileSync(requestPath, mintRequestBase64);

    const signaturePath = path.resolve(cacheDir, "mint-signature.txt");
    fs.writeFileSync(signaturePath, mintSignatureBase64);

    console.log("Mint Request Base64: " + mintRequestBase64);
    console.log("Mint Signature Base64: " + mintSignatureBase64);
}

txCommand.subCommands.push({
    name: "mint-as-user",
    additionalUsage: "",
    summary: "Mints an NFT in the same fashion as a user, using the MintRequest generated by mint-as-backend.",
    run: mintAsUser
});
async function mintAsUser(args: string[]) {

    const context = await getAppContext();

    const cacheDir = path.resolve(__dirname, "../cache");
    const mintRequestPath = path.resolve(cacheDir, "mint-request-base64.txt");
    const mintRequestBase64 = fs.readFileSync(mintRequestPath, "utf-8");
    const mintSignaturePath = path.resolve(cacheDir, "mint-signature.txt");
    const mintSignatureBase64 = fs.readFileSync(mintSignaturePath, "utf-8");

    let mintRequestMsg: MintRequest = fromBase64(mintRequestBase64) as MintRequest;

    let rawMessage = Buffer.from(mintRequestBase64, "base64")
    let msgMd5Hash = Buffer.from(sha256(rawMessage))

    // Optional query to ensure signature is valid before issuing the mint command
    let checkSigQuery: DegaMinterQueryMsg = {
        check_sig: {
            message: {
                mint_request: mintRequestMsg
                //string: rawTextMessage // Uncomment to test with a string instead of the mint request
            },
            signature: mintSignatureBase64,
            signer_source: SignerSourceTypeEnum.ConfigSignerPubKey
            // Uncomment below to test validating with a local public key using on chain logic
            // signer_source: {
            //     pub_key_binary: Buffer.from(context.signerCompressedPublicKey).toString("base64")
            // }
        }
    };

    const checkSigQueryResponse =
        await context.queryWasmApi.fetchSmartContractState(
            context.minterAddress,
            toBase64(checkSigQuery));

    const checkSigQueryResponseObject: object = fromBase64(
        Buffer.from(checkSigQueryResponse.data).toString("base64")
    );

    console.log(checkSigQueryResponseObject);
    console.log();
    console.log("Test Query Locally Calculated Message Hash: " + msgMd5Hash.toString("hex"));

    let contractMsg: DegaMinterExecuteMsg = {
        mint: {
            request: mintRequestMsg,
            signature: mintSignatureBase64
        }
    }

    const execMsg = MsgExecuteContractCompat.fromJSON({
        sender: context.primaryAddress,
        contractAddress: context.minterAddress,
        msg: contractMsg,
        funds: [
            {
                denom: mintRequestMsg.currency,
                amount: mintRequestMsg.price,
                //amount: (nft_price_wei.plus(100)).toFixed() // slight overpayment
                //amount: (nft_price_wei.minus(100)).toFixed() // slight underpayment
            }
        ],
    })

    const response = await context.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: context.gasSettings,
    })

    logResponse(response);
}

txCommand.subCommands.push({
    name: "transfer",
    additionalUsage: "<token-id> <recipient>",
    summary: "Transfer a token with <token-id> to the <receipient>",
    run: transferToken
});
async function transferToken(args: string[]) {

    if (args.length < 2) {
        throw new UsageError("Missing arguments.");
    }

    const context = await getAppContext();

    const tokenId = args[0];
    const recipient = args[1];

    const contractMsg: DegaCw721ExecuteMsg = {
        transfer_nft: {
            recipient: recipient,
            token_id: tokenId
        }
    };

    const execMsg = MsgExecuteContractCompat.fromJSON({
        sender: context.primaryAddress,
        contractAddress: context.cw721Address,
        msg: contractMsg,
        funds: []
    })

    // const execMsgVanilla = MsgExecuteContract.fromJSON({
    //     sender: context.primaryAddress,
    //     contractAddress: context.cw721Address,
    //     msg: contractMsg,
    //     funds: []
    // })

    //execMsgVanilla.toData()["@type"]

    const response = await context.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: context.gasSettings,
    })

    logResponse(response);
}

txCommand.subCommands.push({
    name: "send-nft",
    additionalUsage: "<token-id> <recipient-contract> <receive-message>",
    summary: "Send a token with <token-id> using send_nft call for smart contracts to the <recipient-contract> with a <receive-message>",
    run: sendToken
});
async function sendToken(args: string[]) {

    if (args.length < 2) {
        throw new UsageError("Missing arguments.");
    }

    const context = await getAppContext();

    const tokenId = args[0];
    const recipient_contract = args[1];
    const receiveMsg = args[2];

    const contractMsg: DegaCw721ExecuteMsg = {
        send_nft: {
            contract: recipient_contract,
            token_id: tokenId,
            msg: toBase64(JSON.parse(receiveMsg))
        }
    };

    const execMsg = MsgExecuteContractCompat.fromJSON({
        sender: context.primaryAddress,
        contractAddress: context.cw721Address,
        msg: contractMsg,
        funds: []
    })

    const response = await context.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: context.gasSettings,
    })

    logResponse(response);
}

txCommand.subCommands.push({
    name: "send-to-receiver",
    additionalUsage: "<token-id> <should-succeed>",
    summary: "Send <token-id> to the receiver contract and have the receiver accept or reject based on the <should-succeed> value.",
    run: sendToReceiver
});
async function sendToReceiver(args: string[]) {

    if (args.length < 2) {
        throw new UsageError("Missing arguments.");
    }

    const tokenId = args[0];

    const shouldSucceedString = args[1];

    if (shouldSucceedString != "true" && shouldSucceedString != "false") {
        throw new ScriptError("Invalid should-succeed value. Must be either true or false");
    }

    const shouldSucceed: boolean = (shouldSucceedString == "true");

    const context = await getAppContext();

    if (context.receiverContractAddress == undefined) {
        throw new ScriptError("Receiver address not set in context")
    }

    let innerMsg: Cw721ReceiverTesterInnerMsg =
        shouldSucceed ?
            Cw721ReceiverTesterInnerMsg.Succeed :
            Cw721ReceiverTesterInnerMsg.Fail;

    // Wraps the string "succeed" or "fail" in an extra set of quotes to make it valid json
    let jsonInnerMsg = Convert.cw721ReceiverTesterInnerMsgToJson(innerMsg);
    let base64InnerMsg = Buffer.from(jsonInnerMsg).toString("base64");

    const contractMsg: DegaCw721ExecuteMsg = {
        send_nft: {
            contract: context.receiverContractAddress,
            token_id: tokenId,
            msg: base64InnerMsg
        }
    };

    const execMsg = MsgExecuteContractCompat.fromJSON({
        sender: context.primaryAddress,
        contractAddress: context.cw721Address,
        msg: contractMsg,
        funds: []
    })

    const response = await context.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: context.gasSettings,
    })

    logResponse(response);

}

txCommand.subCommands.push({
    name: "call-receive-nft",
    additionalUsage: "<token-id> <should-succeed>",
    summary: "A test transaction to call receive_nft directly on the receiver contract to ensure it is working properly.",
    run: callReceiveNftOnReceiver
});
async function callReceiveNftOnReceiver(args: string[]) {

    if (args.length < 2) {
        throw new UsageError("Missing arguments.");
    }

    const context = await getAppContext();

    if (context.receiverContractAddress == undefined) {
        throw new ScriptError("Receiver address not set in context")
    }

    const tokenId = args[0];

    const shouldSucceedString = args[1];

    if (shouldSucceedString != "true" && shouldSucceedString != "false") {
        throw new ScriptError("Invalid should-succeed value. Must be either true or false");
    }

    const shouldSucceed: boolean = (shouldSucceedString == "true");

    let innerMsg: Cw721ReceiverTesterInnerMsg =
        shouldSucceed ?
            Cw721ReceiverTesterInnerMsg.Succeed :
            Cw721ReceiverTesterInnerMsg.Fail;

    // Wraps the string "succeed" or "fail" in an extra set of quotes to make it valid json
    let jsonInnerMsg = Convert.cw721ReceiverTesterInnerMsgToJson(innerMsg);
    let base64InnerMsg = Buffer.from(jsonInnerMsg).toString("base64");

    const receiveMsg: Cw721ReceiveMsg = {
        msg: base64InnerMsg,
        sender: context.primaryAddress,
        token_id: tokenId
    };

    const executeMsg: Cw721ReceiverTesterExecuteMsg = {
        receive_nft: receiveMsg
    };

    const execMsg = MsgExecuteContractCompat.fromJSON({
        sender: context.primaryAddress,
        contractAddress: context.receiverContractAddress,
        msg: executeMsg,
        funds: []
    })

    const response = await context.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: context.gasSettings,
    })

    logResponse(response);
}


function seriealizeReceiverInnerMessage(innerMsg: Cw721ReceiverTesterInnerMsg) {
    return Buffer.from(JSON.stringify(innerMsg)).toString("base64");
}

txCommand.subCommands.push({
    name: "send-talis-sale",
    additionalUsage: "<token-id> <price>",
    summary: "Send a token with <token-id> to the Talis market to be sold at the given <price>.",
    run: sendTalisSale
});
async function sendTalisSale(args: string[]) {

    if (args.length < 2) {
        throw new UsageError("Missing arguments.");
    }

    const context = await getAppContext();

    let market_address = ""

    if (Config.NETWORK == "Testnet") {
        market_address = "inj1n8n0p5l48g7xy9y7k4hu694jl4c82ej4mwqmfz"
    } else if (Config.NETWORK == "Mainnet") {
        throw new ScriptError("Mainnet address not known")
    } else {
        throw new ScriptError("Cannot send to Talis when in Localnet")
    }

    const tokenId = args[0];
    const price = new BigNumberInBase(args[1]).toWei().toFixed()

    const sellTokenMsg = {
        sell_token: {
            token_id: tokenId,
            contract_address: context.cw721Address,
            class_id: "injective",
            price: {
                native: [
                    {
                        amount: price,
                        denom: "inj"
                    }
                ]
            }
        }
    };

    const contractMsg: DegaCw721ExecuteMsg = {
        send_nft: {
            contract: market_address,
            token_id: tokenId,
            msg: toBase64(sellTokenMsg)
        }
    };

    const execMsg = MsgExecuteContractCompat.fromJSON({
        sender: context.primaryAddress,
        contractAddress: context.cw721Address,
        msg: contractMsg,
        funds: []
    })

    const response = await context.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: context.gasSettings,
    })

    logResponse(response);
}

txCommand.subCommands.push({
    name: "refill-local",
    additionalUsage: "<amount> [<address>]",
    summary: "Refills <address> with <amount> of INJ tokens. Fills primary address if none specified.",
    run: refillLocal
});
async function refillLocal(args: string[]) {

    const context = await getAppContext();

    if (context.localGenesisAddress == null || context.localGenesisBroadcaster == null) {
        throw new ScriptError("Local Genesis Address required for refilling local")
    }

    if (args.length > 2) {
        throw new UsageError("Too many arguments.");
    }

    const amount = args[0];
    let dstInjectiveAddress = args[1];

    if (!dstInjectiveAddress) {
        dstInjectiveAddress = context.primaryAddress;
    }

     const sendMsg = MsgSend.fromJSON({
        srcInjectiveAddress: context.localGenesisAddress,
        dstInjectiveAddress: dstInjectiveAddress,
        amount: {
            denom: "inj",
            amount: new BigNumberInBase(amount).toWei().toFixed()
        }
    });

    console.log(sendMsg);

    const response = await context.localGenesisBroadcaster.broadcast({
        msgs: sendMsg,
        gas: context.gasSettings,
    })

    logResponse(response);
}


txCommand.subCommands.push({
    name: "instantiate",
    additionalUsage: "[receiver]",
    summary: "Instantiate the contracts with code-id's in the environment. Add 'receiver' to instantiate the receiver contract.",
    run: instantiate
});
async function instantiate(args: string[]) {

    if (args.length == 0 || (args.length == 1 && args[0] == "minter")) {
        await instantiateMinterCmd()
    } else if (args.length == 1 && args[0] == "receiver") {
        await instantiateReceiver(true)
    } else {
        throw new UsageError("Unknown instantiate args.");
    }
}

async function instantiateMinterCmd() {

    const context = await getAppContext();

    const signerCompressedPubKeyBase64 = context.signerCompressedPublicKey.toString("base64")

    console.log("Compressed Pub key Base64: " + signerCompressedPubKeyBase64)
    console.log()

    const instantiateMinterMsg: DegaMinterInstantiateMsg = {
        collection_params: {
            code_id: context.cw721CodeId,
            info: {
                description: "A simple test collection description",
                image: "https://storage.googleapis.com/dega-banner/banner.png"
            },
            name: "Test Collection",
            symbol: "TEST"
        },
        minter_params: {
            dega_minter_settings: {
                signer_pub_key: context.signerCompressedPublicKey.toString("base64"),
                minting_paused: false
            },
            initial_admin: context.primaryAddress,
        },
        cw721_contract_label: "DEGA Collection - Test Collection",
        cw721_contract_admin: context.primaryAddress
    };


    console.log("InstantiateMsg : ")
    console.log(instantiateMinterMsg)
    console.log()

    const instantiateContractMsg = MsgInstantiateContract.fromJSON({
        sender: context.primaryAddress,
        admin: context.primaryAddress,
        codeId: context.minterCodeId,
        label: "DEGA Minter - Test Collection",
        msg: instantiateMinterMsg,
    });

    console.log("Instantiating code for Dega Minter");
    console.log();


    const [response, minterAddress, cw721Address] =
        await instantiateMinter(instantiateContractMsg);


    logResponse(response);

    console.log("");
    console.log("Successfully Instantiated Contract")
    console.log("Minter Address: " + minterAddress);
    console.log("CW721 Address: " + cw721Address);
    console.log("");
}

export async function instantiateMinter(instantiateMessage: MsgInstantiateContract): Promise<[any,string,string]> {

    const context = await getAppContext();

    const response = await context.primaryBroadcaster.broadcast({
        msgs: instantiateMessage,
        gas: context.gasSettings,
    })

    let minterAddress: string | undefined = "";
    let cw721Address: string | undefined = "";

    if (response.events != undefined) {
        let decoder = new TextDecoder();

        response.events.forEach((event: any) => {
            let eventTyped: TxEvent = event as TxEvent;
            if (eventTyped.type == "cosmwasm.wasm.v1.EventContractInstantiated") {
                let is_minter = false;
                let is_cw721 = false;
                let address = "";
                eventTyped.attributes.forEach((attr: TxAttribute) => {
                    let key = decoder.decode(attr.key);
                    let value = decoder.decode(attr.value);
                    if (key == "code_id" && stripQuotes(value) == context.minterCodeId.toString()) {
                        is_minter = true;
                    }
                    if (key == "code_id" && stripQuotes(value) == context.cw721CodeId.toString()) {
                        is_cw721 = true;
                    }
                    if (key == "contract_address") {
                        address = stripQuotes(value);
                    }
                });

                if (is_minter && is_cw721) {
                    throw new ScriptError("Both minter and cw721 contract code_ids found in instantiated event")
                }

                if (is_minter) {
                    minterAddress = address;
                } else if (is_cw721) {
                    cw721Address = address;
                }
            }

        });
    }

    if (minterAddress == "" || cw721Address == "") {
        throw new ScriptError("Minter or CW721 address not found in response during contract instantiation")
    }

    return [response, minterAddress, cw721Address];

}


export async function instantiateReceiver(shouldLogResponse: boolean): Promise<[any,string]> {

    const context = await getAppContext();

    if (!context.receiverCodeId) {
        throw new ScriptError("Cannot instantiate receiver, code id not available in context (try setting in the config for this environment)")
    }

    const instantiateContractMsg = MsgInstantiateContract.fromJSON({
        sender: context.primaryAddress,
        admin: context.primaryAddress,
        codeId: context.receiverCodeId,
        label: "CW721 Receiver Tester",
        msg: {},
    });

    console.log("Instantiating code for CW721 Receiver Tester");
    console.log("");

    if (shouldLogResponse) {
        console.log("Using Receiver Code ID: " + context.receiverCodeId);
        console.log("");
    }

    const response = await context.primaryBroadcaster.broadcast({
        msgs: instantiateContractMsg,
        gas: context.gasSettings,
    })

    let codeAddressPairs = getCodeKeyValuePairsFromEvents(response.events);
    let address = codeAddressPairs.get(context.receiverCodeId);
    if (!address) {
        throw new ScriptError("Receiver code id not found in response")
    }

    if (shouldLogResponse) {
        logResponse(response);
        console.log("Contract address: " + address);
    }

    return [response, address];
}


function getCodeKeyValuePairsFromEvents(events: any): Map<number, string> {
    let codeAddressMap = new Map<number, string>();
    if (events != undefined) {
        let decoder = new TextDecoder();

        events.forEach((event: any) => {
            let eventTyped: TxEvent = event as TxEvent;
            if (eventTyped.type == "cosmwasm.wasm.v1.EventContractInstantiated") {
                let code;
                let address;
                eventTyped.attributes.forEach((attr: TxAttribute) => {
                    let key = decoder.decode(attr.key);
                    let value = stripQuotes(decoder.decode(attr.value));
                    if (key == "code_id") {
                        code = parseInt(value);
                    }
                    if (key == "contract_address") {
                        address = value;
                    }
                });

                if (code != undefined && address != undefined) {
                    codeAddressMap.set(code, address);
                }

            }

        });
    }
    return codeAddressMap;
}

export function stripQuotes(input: string): string {
    if (input.startsWith('"') && input.endsWith('"')) {
        return input.slice(1, -1);
    }
    return input;
}

txCommand.subCommands.push({
    name: "store",
    additionalUsage: "[-c <minter|collection|receiver>]",
    summary: "Stores the codes for the minter and collection by default, or for the specified contract with the -c flag.",
    run: store
});
async function store(args: string[]) {

    if (args.length < 1) {
        await store_wasm("dega_minter.wasm")
        await store_wasm("dega_cw721.wasm")
    } else if (args.length == 2 && args[0] == "-c") {
        if (args[1] == "minter") {
            await store_wasm("dega_minter.wasm")
        } else if (args[1] == "collection") {
            await store_wasm("dega_cw721.wasm")
        } else if (args[1] == "receiver") {
            fs.copyFileSync(path.resolve(__dirname, "../data/cw721_receiver_tester.wasm"),
                path.resolve(__dirname, "../../artifacts/cw721_receiver_tester.wasm"));
            await store_wasm("cw721_receiver_tester.wasm")
        } else {
            throw new ScriptError("Unknown wasm contract: " + args[1]);
        }
    } else {
        throw new ScriptError("Bad arguments");
    }
}

export async function store_wasm(wasm_name: string): Promise<number> {

    const context = await getAppContext();

    const artifactsDir = path.resolve(__dirname, "../../artifacts");
    const wasmPath = path.resolve(artifactsDir, wasm_name);
    const wasmBytes = new Uint8Array(Array.from(fs.readFileSync(wasmPath)));

    const storeCodeMsg = MsgStoreCode.fromJSON({
        sender: context.primaryAddress,
        wasmBytes: wasmBytes
    });

    console.log("Storing code for: " + wasm_name);
    console.log("");


    const response = await context.primaryBroadcaster.broadcast({
        msgs: storeCodeMsg,
        gas: context.gasSettings,
    })

    logResponse(response);

    console.log("Successfully Stored Code")

    let result: null | number = null;

    if (response.events != undefined) {
        let decoder = new TextDecoder();

        response.events.forEach((event: any) => {
            let eventTyped: TxEvent = event as TxEvent;
            if (eventTyped.type == "cosmwasm.wasm.v1.EventCodeStored") {
                eventTyped.attributes.forEach((attr: TxAttribute) => {
                    const key = decoder.decode(attr.key);
                    const value = stripQuotes(decoder.decode(attr.value));
                    console.log(key + ": " + value);
                    if (key == "code_id") {
                        result = parseInt(value);
                    }
                });
            }

        });
        console.log("")
    }

    if (result == null) {
        throw new ScriptError("Code ID not found in response")
    }

    return result;
}

export interface TxEvent {
    type: string,
    attributes: TxAttribute[],
}

export interface TxAttribute {
    key: Uint8Array,
    value: Uint8Array,
}


txCommand.subCommands.push({
    name: "burn",
    additionalUsage: "<token-id>",
    summary: "As the owner or spender of a token, burn the specified <token-id>.",
    run: burn
});
async function burn(args: string[]) {
    if (args.length < 1) {
        throw new UsageError("Missing argument.");
    }

    const context = await getAppContext();

    const tokenId = args[0];

    const contractMsg: DegaCw721ExecuteMsg = {
        burn: {
            token_id: tokenId
        }
    };

    const execMsg = MsgExecuteContractCompat.fromJSON({
        sender: context.primaryAddress,
        contractAddress: context.cw721Address,
        msg: contractMsg,
        funds: []
    })

    const response = await context.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: context.gasSettings,
    })

    logResponse(response);
}

txCommand.subCommands.push({
    name: "transfer-inj",
    additionalUsage: "<receiver> <amount>",
    summary: "Transfer an <amount> of INJ in base units to the <receiver>.",
    run: transferInj
});
async function transferInj(args: string[]) {

    if (args.length != 2) {
        throw new UsageError("Bad arguments.");
    }

    const context = await getAppContext();

    const receiverAddress = args[0];
    const amount = args[1];
    const amountInBase = new BigNumberInBase(parseInt(amount)).toWei().toFixed()


    const sendMsg = MsgSend.fromJSON({
        srcInjectiveAddress: context.primaryAddress,
        dstInjectiveAddress: receiverAddress,
        amount: {
            denom: "inj",
            amount: amountInBase
        }
    });

    console.log(sendMsg);

    const response = await context.primaryBroadcaster.broadcast({
        msgs: sendMsg,
        gas: context.gasSettings,
    })

    logResponse(response);
}

function getExpirationEpochInNanos(amount: string, units: string) {
    let expirationSpanInSeconds: number = 0;

    switch (units) {
        case "day":
        case "days":
            expirationSpanInSeconds = parseFloat(amount) * 24 * 60 * 60;
            break;
        case "hour":
        case "hours":
            expirationSpanInSeconds = parseFloat(amount) * 60 * 60;
            break;
        case "minute":
        case "minutes":
            expirationSpanInSeconds = parseFloat(amount) * 60;
            break;
        default:
            throw new ScriptError("Invalid time unit. Must be either day(s), hour(s), or minute(s)");
    }

    let epochInMs = new BigNumberInBase(Math.round(Date.now()));
    let epochInNanos = epochInMs.times(1_000_000);
    let expirationInNanos =
        new BigNumberInBase(Math.round(expirationSpanInSeconds)).times(1_000_000_000);

    return epochInNanos.plus(expirationInNanos);
}

txCommand.subCommands.push({
    name: "spender",
    additionalUsage: "<add|remove> <spender-address> <token-id> [<expiration-number> <day(s)|hour(s)|minute(s)>]",
    summary: "As a token owner, add or remove a spender for a token with <token-id>. Optionally specify an expiration duration.",
    run: spender
});
async function spender(args: string[]) {

    const usage = "Usage: tx spender ";

    if (args.length < 3 || args.length > 5) {
        throw new UsageError(`Bad arguments`);
    }

    const addRemoveString = args[0];

    if (addRemoveString != "add" && addRemoveString != "remove") {
        throw new UsageError("Invalid <add|remove> value. Must be either add or remove");
    }

    const isAdding: boolean = (addRemoveString == "add");

    if (!isAdding && args.length != 3) {
        throw new UsageError(`Expiration must only be provided if adding a spender`);
    }

    const context = await getAppContext();

    const spenderAddress = args[1];
    const tokenId = args[2];

    let contractMsg: DegaCw721ExecuteMsg = {};

    if (isAdding) {

        if (args.length == 4) {
            throw new UsageError(`Must specify time unit if specifying expiration span (e.g. "3 days").`);
        }

        let expiration: Expiration = {};

        if (args.length == 5) {

            const expirationNum = args[3];
            const timeUnit = args[4];

            let epochInMs = new BigNumberInBase(Math.round(Date.now()));
            let epochInNanos = epochInMs.times(1_000_000);
            console.log("Current epoch time in Nanos: " + epochInNanos.toString());

            expiration.at_time = getExpirationEpochInNanos(expirationNum, timeUnit).toString();

            console.log("Setting Expiration: " + expiration.at_time)

        } else {
            expiration.never = {};
        }

        contractMsg.approve = {
            spender: spenderAddress,
            token_id: tokenId,
            expires: expiration
        }
    } else {
        contractMsg.revoke = {
            spender: spenderAddress,
            token_id: tokenId
        }
    }

    const execMsg = MsgExecuteContractCompat.fromJSON({
        sender: context.primaryAddress,
        contractAddress: context.cw721Address,
        msg: contractMsg,
        funds: []
    })

    const response = await context.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: context.gasSettings,
    })

    logResponse(response);
}

txCommand.subCommands.push({
    name: "operator",
    additionalUsage: "<add|remove> <operator-address> [<expiration-number> <day(s)|hour(s)|minute(s)>]",
    summary: "As a token owner, add or remove an operator for all your tokens. Optionally specify an expiration duration.",
    run: operator
});
async function operator(args: string[]) {

    if (args.length < 2 || args.length > 4) {
        throw new UsageError(`Bad arguments.`);
    }

    const addRemoveString = args[0];

    if (addRemoveString != "add" && addRemoveString != "remove") {
        throw new UsageError("Invalid <add|remove> value. Must be either add or remove");
    }

    const isAdding: boolean = (addRemoveString == "add");

    if (!isAdding && args.length != 2) {
        throw new UsageError(`Expiration must only be provided if adding an operator`);
    }

    const context = await getAppContext();

    const operatorAddress = args[1];

    let contractMsg: DegaCw721ExecuteMsg = {};

    if (isAdding) {

        if (args.length == 3) {
            throw new UsageError(`Must specify time unit if specifying expiration span (e.g. "3 days").`);
        }

        let expiration: Expiration = {};

        if (args.length == 4) {
            const expirationNum = args[2];
            const timeUnit = args[3];

            let epochInMs = new BigNumberInBase(Math.round(Date.now()));
            let epochInNanos = epochInMs.times(1_000_000);
            console.log("Current epoch time in Nanos: " + epochInNanos.toString());

            expiration.at_time = getExpirationEpochInNanos(expirationNum, timeUnit).toString();

            console.log("Setting Expiration: " + expiration.at_time)

        } else {
            expiration.never = {};
        }

        contractMsg.approve_all = {
            operator: operatorAddress,
            expires: expiration
        }
    } else {
        contractMsg.revoke_all = {
            operator: operatorAddress,
        }
    }

    const execMsg = MsgExecuteContractCompat.fromJSON({
        sender: context.primaryAddress,
        contractAddress: context.cw721Address,
        msg: contractMsg,
        funds: []
    })

    const response = await context.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: context.gasSettings,
    })

    logResponse(response);
}


txCommand.subCommands.push({
    name: "migrate",
    additionalUsage: "<dev-version>",
    summary: "Migrate the minter and collection contracts to the specified <dev-version>.",
    run: migrate
});
async function migrate(args: string[]) {

    if (args.length < 1) {
        throw new UsageError("Missing argument.");
    }

    const context = await getAppContext();

    const devVersion = args[0];

    {
        const minterCodeId = context.minterCodeId;
        const minterAddress = context.minterAddress
        const migrateMinterMsg: DegaMinterMigrateMsg = {
            is_dev: true,
            dev_version: devVersion,
        };

        await migrateContract(
            minterCodeId,
            minterAddress,
            migrateMinterMsg,
            "DEGA Minter"
        );
    }

    {
        let cw721CodeId = context.cw721CodeId;
        const cw721Address = context.cw721Address;
        const migrateCw721Msg: DegaCw721MigrateMsg = {
            is_dev: true,
            dev_version: devVersion,
        };

        await migrateContract(
            cw721CodeId,
            cw721Address,
            migrateCw721Msg,
            "DEGA CW721"
        );
    }

}


async function migrateContract(
    codeId: number,
    contractAddress: string,
    migrateMessage: object,
    contractName: string,
) {

    const context = await getAppContext();

    const migrateContractMsg = MsgMigrateContract.fromJSON({
        sender: context.primaryAddress,
        codeId: codeId,
        msg: migrateMessage,
        contract: contractAddress,
    });

    console.log(`Migrating code for ${contractName}`);
    console.log("");

    const response = await context.primaryBroadcaster.broadcast({
        msgs: migrateContractMsg,
        gas: context.gasSettings
    });

    logResponse(response);

    console.log(`Successfully Migrated ${contractName}`)
}

txCommand.subCommands.push({
    name: "gov-proposal",
    additionalUsage: "",
    summary: "Test for generating a governance proposal transaction.",
    run: govProposal
});
async function govProposal(
    args: string[]
) {

    if (args.length < 1) {
        throw new ScriptError("Missing argument. Usage: tx gov-proposal <simulate|broadcast>");
    }

    const context = await getAppContext();

    const dryRunString = args[0];

    if (dryRunString != "simulate" && dryRunString != "broadcast") {
        throw new ScriptError("Invalid on value. Must be either simulate or broadcast");
    }

    {
        const wasmName = "dega_minter.wasm"
        const testTitle = "Store Code for the DEGA Minter Contract"
        const testDescriptionFileName = "example-post.txt"

        await govProposalStoreCode(
            wasmName,
            testTitle,
            testDescriptionFileName,
            [context.primaryAddress],
            dryRunString != "broadcast"
        );
    }

    await sleep(10);

    {
        const wasmName = "dega_cw721.wasm"
        const testTitle = "Store Code for the DEGA Collection Contract"
        const testDescriptionFileName = "example-post.txt"

        await govProposalStoreCode(
            wasmName,
            testTitle,
            testDescriptionFileName,
            null,
            dryRunString != "broadcast"
        );
    }
}



async function govProposalStoreCode(
    wasm_name: string,
    title: string,
    summaryFileName: string,
    instantiateAddresses: string[] | null,
    dryRun: boolean
) {

    const context = await getAppContext();

    if (Config.NETWORK != "Local") {
        throw new ScriptError("This command is only meant for localnet, use the deploy tool for testnet and mainnet");
    }

    const artifactsDir = path.resolve(__dirname, "../../artifacts");
    const wasmPath = path.resolve(artifactsDir, wasm_name);

    const gasPrices = context.gasPricesAmountWei.toFixed();
    const gas = new BigNumberInWei(60000000).toFixed();
    const despositAmountInBaseInj = 100;
    const despositAmountInWei = new BigNumberInBase(despositAmountInBaseInj).toWei().toFixed();

    let instantiateArg;

    if (instantiateAddresses == null || instantiateAddresses.length == 0) {
        instantiateArg = ` --instantiate-everybody true`;
    } else {
        instantiateArg = ` --instantiate-anyof-addresses "` + instantiateAddresses.join(",") + `"`;
    }

    const summaryFilePath = path.resolve(__dirname, "../data", summaryFileName);
    const summaryContents = fs.readFileSync(summaryFilePath, "utf-8");

    const htmlPreview =
        `<html>\n` +
        `<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />\n` +
        replaceLineEndingsWithBreaks(summaryContents) + `\n` +
        `</html>\n`;

    const htmlPreviewFileName = summaryFileName.replace(".txt", ".html")
    const htmlPreviewPath = path.resolve(__dirname, "../cache", htmlPreviewFileName);
    fs.writeFileSync(htmlPreviewPath, htmlPreview);

    // Replace carrots for HTML in the front end
    const unicodeEncodedSummaryString = replaceWithUnicode(summaryContents);

    // Replace line endings with \n
    const newLineNormalizedSummaryString = replaceLineEndingsWithSlashN(unicodeEncodedSummaryString);

    // Replace double quotes for the command line command
    const escapedSummaryString = escapeDoubleQuotes(newLineNormalizedSummaryString);

    // Build your command using the variables
    // let command =
    //     `yes ${Config.INJECTIVED_PASSWORD} |` +
    //     ` injectived tx wasm submit-proposal` +
    //     ` wasm-store "${wasmPath}"` +
    //     ` --title="${title}"` +
    //     ` --summary="${escapedSummaryString}"` +
    //     instantiateArg +
    //     ` --broadcast-mode=sync` +
    //     ` --chain-id="${context.primaryBroadcaster.chainId}"` +
    //     //` --node=https://sentry.tm.injective.network:443` +
    //     ` --deposit=${despositAmountInWei}inj` +
    //     ` --gas=${gas}` +
    //     ` --gas-prices=${gasPrices}inj` +
    //     ` --from=${(dryRun ? context.localGenesisAddress : "genesis")}` +
    //     ` --yes` +
    //     ` --output json` +
    //     (dryRun ? ` --dry-run` : ``)
    // ;


    let command =
        `yes ${Config.INJECTIVED_PASSWORD} |`
            + ` injectived tx wasm submit-proposal`
            + ` wasm-store "${wasmPath}"`
            + ` --title="${title}"`
            + ` --summary="${escapedSummaryString}"`
            + instantiateArg
            //+ ` --node=https://sentry.tm.injective.network:443`
            + ` --deposit=${despositAmountInWei}inj`
            + ` --gas=${gas}`
            + ` --gas-prices=${gasPrices}inj`
            //+ ` --from=${(dryRun ? context.localGenesisAddress : "genesis")}`
            + ` --yes`
            + ` --output json`
            + ` --offline`
            + ` --generate-only`

            //+ (dryRun ? ` --dry-run` : ``)

            //+ ` --broadcast-mode=sync`
            //+ ` --chain-id="${context.primaryBroadcaster.chainId}"`
    ;


    console.log("Running governance proposal for: " + wasm_name)

    execSync(command);
}


