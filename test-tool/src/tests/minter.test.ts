import {DegaMinterExecuteMsg, DegaMinterInstantiateMsg, DegaMinterQueryMsg} from "../messages";
import {Config} from "../config";
import {fromBase64, MsgExecuteContractCompat, MsgInstantiateContract, sha256, toBase64} from "@injectivelabs/sdk-ts";
import {stripQuotes, TxAttribute, TxEvent} from "../tx";
import {BigNumberInBase} from "@injectivelabs/utils";
import {MintRequest} from "../messages/dega_minter_execute";
import {v4 as uuidv4} from "uuid";
import secp256k1 from "secp256k1";
import {SignerSourceTypeEnum} from "../messages/dega_minter_query";
import {getAppContext} from "../context";
import {getTestContext} from "./testContext";
import {info} from "../query";


describe('Dega Minter', () => {


    it('should mint an NFT successfully', async () => {


        const appContext = await getAppContext();
        const testContext = await getTestContext();

        let nft_price_base = new BigNumberInBase (0.5);
        let nft_price_wei = nft_price_base.toWei();

        const nowInSeconds: number = Math.floor(Date.now() / 1000);

        const startTimeInSeconds: number = nowInSeconds - 5; // 5 seconds ago
        //const startTimeInSeconds: number = nowInSeconds + 60; // 60 seconds from now (intentional error)

        const endTimeInSeconds: number = nowInSeconds + 60 * 5; // 5 minutes from now

        //const endTimeInSeconds: number = nowInSeconds + 8; // 8 seconds from now (intentional error)
        //await sleep(12); // wait 12 seconds

        let mintRequestMsg: MintRequest = {
            to: testContext.testAddressOne,
            primary_sale_recipient: testContext.testAddressTwo,
            uri: "https://example.com",
            price: nft_price_wei.toFixed(),
            currency: "inj",
            //currency: "other",
            validity_start_timestamp: startTimeInSeconds.toString(),
            validity_end_timestamp: endTimeInSeconds.toString(),
            uuid: uuidv4(),
            //uuid: "8c288b70-dc7b-47d6-9412-1840f8c25a57",
            collection: appContext.cw721Address,
        };

        //let rawTextMessage = "test message";
        //let rawMessage = Buffer.from(rawTextMessage, "utf-8");

        let rawMessage = Buffer.from(toBase64(mintRequestMsg), "base64")
        let msgMd5Hash = Buffer.from(sha256(rawMessage))
        let signature = Buffer.from(secp256k1.ecdsaSign(msgMd5Hash, appContext.signerSigningKey).signature)

        console.log("PubKey Compressed: " + appContext.signerCompressedPublicKey.toString("base64"));


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
                //     pub_key_binary: Buffer.from(signerCompressedPublicKey).toString("base64")
                // }
            }
        };

        const checkSigQueryResponse =
            await appContext.queryWasmApi.fetchSmartContractState(
                appContext.minterAddress,
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
            sender: appContext.primaryAddress,
            contractAddress: appContext.minterAddress,
            msg: contractMsg,
            funds: [
                {
                    denom: "inj",
                    amount: nft_price_wei.toFixed()
                    //amount: (nft_price_wei.plus(100)).toFixed() // slight overpayment
                    //amount: (nft_price_wei.minus(100)).toFixed() // slight underpayment
                }
            ],
        })

        await info([]);

        console.log(`Minter Address: `, appContext.minterAddress);

        const response = await appContext.primaryBroadcaster.broadcast({
            msgs: execMsg,
            gas: appContext.gasSettings,
        })

        expect(response.code).toEqual(0);
    }, 15000);
});