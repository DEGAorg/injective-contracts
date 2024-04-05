import {
    DegaMinterExecuteMsg,
    //MintRequest
} from "./messages";
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
    ChainGrpcAuthApi,
} from "@injectivelabs/sdk-ts";
import { BigNumberInBase } from '@injectivelabs/utils'
import { exec } from 'child_process';


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
        case "instantiate":
            break;
        case "mint":
            await mint(args);
            break;
        case "sign":
            await sign(args);
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


    const chainGrpcAuthApi = new ChainGrpcAuthApi(Context.endpoints.grpc)
    const accountDetailsResponse = await chainGrpcAuthApi.fetchAccount(
        Context.primaryAddress,
    )
    //const baseAccount = BaseAccount.fromRestCosmosApi(accountDetailsResponse.baseAccount)
    //const accountDetails = baseAccount.toAccountDetails()

    console.log(Context.primaryPrivateKey);

    console.log("Account Details Response:");
    console.log(accountDetailsResponse);
    // console.log("Base Account:");
    // console.log(baseAccount);
    // console.log("Account Details:");
    // console.log(accountDetails)

    let contractMsg: DegaMinterExecuteMsg = {
        mint: {
            token_uri: "https://www.domain.com"
        }
    }

    const execMsg = MsgExecuteContractCompat.fromJSON({
        sender: Context.primaryAddress,
        contractAddress: Config.MINTER_ADDRESS,
        msg: contractMsg,
        funds: [],
    });


    const response = await Context.primaryBroadcaster.broadcast({
        msgs: execMsg,
        gas: Context.gasSettings,
    })

    console.log(response);

    //await sleep(3000);
    //await backupPromiseCall(() => counterStore.fetchCount());
}

// interface MintRequest {
//     to: string, // address
//     royaltyRecipient: string, // address
//     royaltyBps: string,  // uint256
//     primarySaleRecipient: string, // uint256
//     uri: string, // string (url)
//     price: string, // uint256
//     currency: string, // address
//     validityStartTimestamp: number, // uint128
//     validityEndTimestamp: number, // uint128
//     uid: number, // bytes32
// }

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

    let mintRequestMsg = { //: MintRequest = {
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

    if (args.length < 1 || (args[0] != "primary" && args[0] != "signer")) {
        throw new Error("Please specify either 'primary' or 'signer' as the recipient of the refill.");
    }

     const sendMsg = MsgSend.fromJSON({
        srcInjectiveAddress: Context.localGenesisAddress,
        dstInjectiveAddress: (args[0] == "primary") ? Context.primaryAddress : Context.signerAddress,
        amount: {
            denom: "inj",
            amount: new BigNumberInBase(0.01).toWei().toFixed()
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
    const gasPrices = Context.gasPricesAmountGwei.toFixed() + "inj";
    const gas = Context.gasAmountGwei.toFixed() + "inj";
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