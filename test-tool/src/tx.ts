import {
    DegaMinterExecuteMsg,
    DegaMinterInstantiateMsg, DegaMinterQueryMsg
} from "./messages";
import {
    MintRequest
} from "./messages/dega_minter_execute";
import {Config} from "./config";
import {
    Context,
} from "./context";
import {
    fromBase64,
    toBase64,
    createTransaction,
    MsgExecuteContractCompat,
    MsgSend,
    ChainRestAuthApi,
    BaseAccount,
    ChainGrpcAuthApi, MsgStoreCode, MsgInstantiateContract, sha256,
} from "@injectivelabs/sdk-ts";
import { BigNumberInBase } from '@injectivelabs/utils'
import { exec } from 'child_process';
import path from "node:path";
import fs from "fs";
import secp256k1 from "secp256k1";
import {SignerSourceTypeEnum} from "./messages/dega_minter_query";


// Transaction Exec example:
// https://github.com/InjectiveLabs/injective-create-app-template-nuxt-sc-counter/blob/c94c68de41cb0292c6df27dcd4354d64906ca901/store/counter.ts#L21

export async function tx(args: string[]) {

    let sub_command = "sign"; // default to query
    let sub_args = new Array<string>();

    let shift_result = args.shift();
    if (shift_result != undefined) {
        sub_command = shift_result;
    }

    switch (sub_command) {
        case "i":
        case "instantiate":
            await instantiate(args);
            break;
        case "mint":
            await mint(args);
            break;
        case "sign":
            await sign(args);
            break;
        case "s":
        case "store":
            await store(args);
            break;
        case "refill-local":
            await refillLocal(args);
            break;
        default:
            console.log("Unknown test execute sub-command: " + sub_command);
            break;
    }
}

async function mint(args: string[]) {

    let nft_price_base = new BigNumberInBase (0.5);
    let nft_price_wei = nft_price_base.toWei();

    let mintRequestMsg: MintRequest = {
        to: Context.primaryAddress,
        royalty_recipient: Context.primaryAddress,
        royalty_bps: "0",
        primary_sale_recipient: Context.primaryAddress,
        uri: "https://example.com",
        price: nft_price_wei.toFixed(),
        currency: "inj",
        validity_start_timestamp: "0",
        validity_end_timestamp: "0",
        uid: 0,
    };

    //let rawTextMessage = "test message";
    //let rawMessage = Buffer.from(rawTextMessage, "utf-8");

    let rawMessage = Buffer.from(toBase64(mintRequestMsg), "base64")
    let msgMd5Hash = Buffer.from(sha256(rawMessage))
    let signingKey = Context.signerSigningKey
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
            //     pub_key_binary: Buffer.from(Context.signerCompressedPublicKey).toString("base64")
            // }
        }
    };

    const checkSigQueryResponse =
        await Context.chainGrpcWasmApi.fetchSmartContractState(
            Config.MINTER_ADDRESS,
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
        sender: Context.primaryAddress,
        contractAddress: Config.MINTER_ADDRESS,
        msg: contractMsg,
        funds: [
            {
                denom: "inj",
                amount: nft_price_wei.toFixed()
            }
        ],
    })

    const response = await Context.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: Context.gasSettings,
    })

    console.log(response);

    //await sleep(3000);
    //await backupPromiseCall(() => counterStore.fetchCount());
}


// Private Key based Transaction example: (Also includes details on signing a message with the cosmos library)
// https://github.com/InjectiveLabs/injective-ts/blob/ce8f591ea66e15f3a620734146a342ecb94bb2d6/.gitbook/transactions/private-key.md

// https://github.com/CosmWasm/cosmwasm/tree/main/packages/crypto
// https://github.com/CosmWasm/cosmwasm/blob/main/packages/crypto/src/secp256k1.rs

// See:
// fn secp256k1_verify
// fn ed25519_verify
// fn ed25519_batch_verify
//
// from DepsMut.Api in the smart contract parameters.

export async function sign(args: string[]) {

    let mintRequestMsg: MintRequest = {
        to: Context.primaryAddress,
        royalty_recipient: Context.primaryAddress,
        royalty_bps: "0",
        primary_sale_recipient: Context.primaryAddress,
        uri: "https://www.domain.com",
        price: "0",
        currency: Context.primaryAddress,
        validity_start_timestamp: "0",
        validity_end_timestamp: "0",
        uid: 0,
    };

    let mintRequestBase64 = toBase64(mintRequestMsg);
    let buffer = Buffer.from(mintRequestBase64, "base64");
    //let uint8Array = new Uint8Array(buffer);

    const signature = await Context.signerPrivateKey.sign(buffer);
    let sigBase64 = toBase64(signature);

    console.log("Sig Length: " + sigBase64.length);

    console.log("Tx: ");
    console.log(mintRequestMsg);
    console.log();
    console.log("Signature: " + sigBase64);
    console.log();
    console.log("Address: " + Context.signerAddress);
    console.log();

    const checkSigQueryResponse = await Context.chainGrpcWasmApi.fetchSmartContractState(
        Config.MINTER_ADDRESS,
        toBase64({
            // check_sig: {
            //     //mint_request: mintRequestBase64,
            //     signature: sigBase64,
            //     //maybe_signer: null,
            // }
            check_sig: {
                maybe_signer: null,
                mint_request: mintRequestMsg,
                signature: sigBase64,
            }

        }) // as DegaMinterQueryMsg),
    );

    const checkSigQueryResponseObject: object = fromBase64(
        Buffer.from(checkSigQueryResponse.data).toString("base64")
    );

    console.log(checkSigQueryResponseObject);
}


async function refillLocal(args: string[]) {

    if (args.length < 1 || (args[0] != "primary" && args[0] != "signer" && args[0] != "other")) {
        throw new Error("Please specify either 'primary' or 'signer' as the recipient of the refill.");
    }

    let dstInjectiveAddress = "";

    switch (args[0]) {
        case "primary":
            dstInjectiveAddress = Context.primaryAddress;
            break;
        case "signer":
                dstInjectiveAddress = Context.signerAddress;
                break;
        case "other":
            if (args.length < 2) {
                throw new Error("Please specify the address of the recipient of the refill.");
            }
            dstInjectiveAddress = args[1];
            break;
        default:
            throw new Error("Please specify either 'primary' or 'signer' as the recipient of the refill.");

    }

     const sendMsg = MsgSend.fromJSON({
        srcInjectiveAddress: Context.localGenesisAddress,
        dstInjectiveAddress: dstInjectiveAddress,
        amount: {
            denom: "inj",
            amount: new BigNumberInBase(10).toWei().toFixed()
        }
    });

    console.log(sendMsg);

    const response = await Context.localGenesisBroadcaster.broadcast({
        msgs: sendMsg,
        gas: {
            gasPrice: new BigNumberInBase(0.01).toWei().toFixed()
        }
    })

    console.log(response);

    //await sleep(3000);
    //await backupPromiseCall(() => counterStore.fetchCount());
}

// Note used now but keeping as a reference
async function refillLocalCommandLine(args: string[]) {

    if (args.length < 1 || (args[0] != "primary" && args[0] != "signer")) {
        throw new Error("Please specify either 'primary' or 'signer' as the recipient of the refill.");
    }

    const dstInjectiveAddress = (args[0] == "primary") ? Context.primaryAddress : Context.signerAddress;
    const gasPrices = Context.gasPricesAmountWei.toFixed() + "inj";
    const gas = Context.gasAmountWei.toFixed() + "inj";
    const refillAmount = new BigNumberInBase(0.01).toWei().toFixed();

    // Build your command using the variables
    const command =
        `yes ${Config.INJECTIVED_PASSWORD}` +
        ` | injectived tx bank send --from=genesis --chain-id="injective-1"` +
        ` --yes --gas-prices=${gasPrices}inj --gas=${gas}inj` +
        ` ${Context.localGenesisAddress} ${dstInjectiveAddress} ${refillAmount}inj`;

    console.log("Running command: " + command)

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
    });
}

async function instantiate(args: string[]) {
    await instantiate_minter();
}

async function instantiate_minter() {

    const instantiateMinterMsg: DegaMinterInstantiateMsg = {
        collection_params: {
            code_id: Config.CW721_CODE_ID,
            info: {
                creator: Context.primaryAddress,
                description: "A simple test collection description",
                image: "https://storage.googleapis.com/dega-banner/banner.png"
            },
            name: "Test Collection",
            symbol: "TEST"
        },
        minter_params: {
            allowed_sg721_code_ids: [],
            creation_fee: {
                amount: "0",
                denom: "inj"
            },
            extension: {
                dega_minter_settings: {
                    signer_pub_key:
                        Context.signerCompressedPublicKey.toString("base64"),
                }
            },
            frozen: false,
            max_trading_offset_secs: 0,
            min_mint_price: {
                amount: "0",
                denom: "inj"
            },
            mint_fee_bps: 0
        }

    };

    const instantiateContractMsg = MsgInstantiateContract.fromJSON({
        sender: Context.primaryAddress,
        admin: Context.primaryAddress,
        codeId: Config.MINTER_CODE_ID,
        label: "dega-minter",
        msg: instantiateMinterMsg,
    });

    console.log("Instantiating code for Dega Minter");
    console.log();

    const response = await Context.primaryBroadcaster.broadcast({
        msgs: instantiateContractMsg,
        gas: {
            gasPrice: Context.gasPricesAmountWei.toFixed(),
            gas: Context.gasAmountWei.toNumber()
        }
    })

    //console.log(response);

    console.log("Successfully Instantiated Contract")
    console.log("TX: " + response.txHash)

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
                    if (key == "code_id" && stripQuotes(value) == Config.MINTER_CODE_ID.toString()) {
                        is_minter = true;
                    }
                    if (key == "code_id" && stripQuotes(value) == Config.CW721_CODE_ID.toString()) {
                        is_cw721 = true;
                    }
                    if (key == "contract_address") {
                        address = value;
                    }
                });

                if (is_minter && is_cw721) {
                    throw new Error("Both minter and cw721 contract code_ids found in instantiated event")
                }

                if (is_minter) {
                    console.log("Minter Address: " + address);
                } else if (is_cw721) {
                    console.log("CW721 Address: " + address);
                }
            }

        });
        console.log("")
    }

    //await sleep(3000);
    //await backupPromiseCall(() => counterStore.fetchCount());
}

function stripQuotes(input: string): string {
    if (input.startsWith('"') && input.endsWith('"')) {
        return input.slice(1, -1);
    }
    return input;
}


async function store(args: string[]) {

    if (args.length < 1) {
        await store_wasm("dega_minter.wasm")
        await store_wasm("dega_cw721.wasm")
    } else if (args.length == 2 && args[0] == "-c") {
        if (args[1] == "dega-minter") {
            await store_wasm("dega_minter.wasm")
        } else if (args[1] == "dega-cw721") {
            await store_wasm("dega_cw721.wasm")
        } else {
            throw new Error("Unknown wasm contract: " + args[1]);
        }
    } else {
        throw new Error("Bad arguments");
    }
}

async function store_wasm(wasm_name: string) {

    const artifactsDir = path.resolve(__dirname, "../../artifacts");
    const minterPath = path.resolve(artifactsDir, wasm_name);
    const wasmBytes = new Uint8Array(Array.from(fs.readFileSync(minterPath)));

    const storeCodeMsg = MsgStoreCode.fromJSON({
        sender: Context.primaryAddress,
        wasmBytes: wasmBytes
    });

    console.log("Storing code for: " + wasm_name);
    console.log();

    const response = await Context.primaryBroadcaster.broadcast({
        msgs: storeCodeMsg,
        gas: {
            gasPrice: Context.gasPricesAmountWei.toFixed(),
            gas: Context.gasAmountWei.toNumber()
        }
    })

    //console.log(response);

    console.log("Successfully Stored Code")

    if (response.events != undefined) {
        let decoder = new TextDecoder();

        response.events.forEach((event: any) => {
            let eventTyped: TxEvent = event as TxEvent;
            if (eventTyped.type == "cosmwasm.wasm.v1.EventCodeStored") {
                eventTyped.attributes.forEach((attr: TxAttribute) => {
                    console.log(decoder.decode(attr.key) + ": " + decoder.decode(attr.value));
                });
            }

        });
        console.log("")
    }

    //await sleep(3000);
    //await backupPromiseCall(() => counterStore.fetchCount());
}

interface TxEvent {
    type: string,
    attributes: TxAttribute[],
}

interface TxAttribute {
    key: Uint8Array,
    value: Uint8Array,
}


async function storeCommandLine(args: string[]) {

    const artifactsDir = path.resolve(__dirname, "../../artifacts");
    const minterPath = path.resolve(artifactsDir, "dega_minter.wasm");

    const payerAddress = Context.primaryAddress;
    const gasPrices = Context.gasPricesAmountWei.toFixed();
    const gas = Context.gasAmountWei.toFixed();

    // Build your command using the variables
    const command =
        `yes ${Config.INJECTIVED_PASSWORD}` +
        ` | injectived tx wasm store ${minterPath} --from=${payerAddress} --chain-id="injective-1"` +
        ` --yes --gas-prices=${gasPrices}inj --gas=${gas}`; // note, the --gas param does NOT have the "inj" suffix

    console.log("Running command: " + command)

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
    });
}