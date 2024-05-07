import {BigNumberInBase} from "@injectivelabs/utils";
import {DegaMinterExecuteMsg, MintRequest} from "./messages/dega_minter_execute";
import {Context} from "./context";
import {v4 as uuidv4} from "uuid";
import {
    ChainGrpcBankApi, ChainGrpcWasmApi,
    fromBase64,
    MsgBroadcasterWithPk,
    MsgExecuteContractCompat, MsgInstantiateContract, MsgSend,
    PrivateKey,
    sha256,
    toBase64
} from "@injectivelabs/sdk-ts";
import secp256k1 from "secp256k1";
import {DegaMinterInstantiateMsg, DegaMinterQueryMsg} from "./messages";
import {SignerSourceTypeEnum} from "./messages/dega_minter_query";
import {Config} from "./config";
import {getNetworkEndpoints, Network} from "@injectivelabs/networks";
import { randomBytes } from "crypto"
import {ChainId} from "@injectivelabs/ts-types";
import {store_wasm, stripQuotes, TxAttribute, TxEvent} from "./tx";


function generatePrivateKey() {
    return PrivateKey.fromHex("0x" + randomBytes(32).toString("hex"));
}

const testPrivateKeyTransactor = generatePrivateKey();
const testAddressTransactor = testPrivateKeyTransactor.toBech32();
const testBroadcasterTransactor = new MsgBroadcasterWithPk({
    privateKey: testPrivateKeyTransactor, /** private key hash or PrivateKey class from sdk-ts */
    network: Network.Local,
})
testBroadcasterTransactor.chainId = ChainId.Mainnet;

const testPrivateKeySigner = generatePrivateKey();
const testSignerSigningKey = Buffer.from(testPrivateKeySigner.toPrivateKeyHex().slice(2), "hex");

if (!secp256k1.privateKeyVerify(testSignerSigningKey)) {
    throw new Error("Invalid test signer private key");
}

const signerCompressedPublicKey = Buffer.from(secp256k1.publicKeyCreate(testSignerSigningKey, true))

const testPrivateKeyOne = generatePrivateKey();
const testAddressOne = testPrivateKeyOne.toBech32();

const testPrivateKeyTwo = generatePrivateKey();
const testAddressTwo = testPrivateKeyTwo.toBech32();

const testPrivateKeyThree = generatePrivateKey();
const testAddressThree = testPrivateKeyThree.toBech32();

const localEndpoints = getNetworkEndpoints(Network.Local);
const localChainGrpcBankApi = new ChainGrpcBankApi(localEndpoints.grpc);
const localChainGrpcWasmApi = new ChainGrpcWasmApi(localEndpoints.grpc);

async function getMsgForFillingTestAddress(genesisAddress: string, addressToFill: string, amountInjInBase: number) {
    return MsgSend.fromJSON({
        srcInjectiveAddress: genesisAddress,
        dstInjectiveAddress: addressToFill,
        amount: {
            denom: "inj",
            amount: new BigNumberInBase(amountInjInBase).toWei().toFixed()
        }
    });
}

async function initIntegrationTestContext() {

    console.log = function() {}

    const hasGenesisMnemonic = Config.LOCAL_GENESIS_MNEMONIC != undefined && Config.LOCAL_GENESIS_MNEMONIC != "";

    if (!hasGenesisMnemonic) {
        throw new Error("Integration tests require a local genesis mnemonic to source test tokens from")
    }

    const localGenesisPrivateKey = PrivateKey.fromMnemonic(Config.LOCAL_GENESIS_MNEMONIC);
    const localGenesisAddress = localGenesisPrivateKey.toBech32();

    const localGenesisBroadcaster = new MsgBroadcasterWithPk({
        privateKey: localGenesisPrivateKey, /** private key hash or PrivateKey class from sdk-ts */
        network: Network.Local,
    })
    localGenesisBroadcaster.chainId = ChainId.Mainnet;

    let sendMessages = [];

    sendMessages.push(await getMsgForFillingTestAddress(localGenesisAddress, testAddressTransactor, 1));

    await localGenesisBroadcaster.broadcast({
        msgs: sendMessages,
        gas: {
            gasPrice: new BigNumberInBase(0.01).toWei().toFixed()
        }
    })


}

let testMinterAddress: string | null = null;
let testCw721Address: string | null = null;

describe('Dega Injective Integration Test Suite', () => {

    beforeAll(async () => {
        // This code will run once before all tests
        await initIntegrationTestContext();
    }, 15000);

    it('should instantiate the contracts', async () => {


        const signerCompressedPubKeyBase64 = Context.signerCompressedPublicKey.toString("base64")

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
                creation_fee: {
                    amount: "0",
                    denom: "inj"
                },
                extension: {
                    dega_minter_settings: {
                        signer_pub_key: Context.signerCompressedPublicKey.toString("base64"),
                        minting_paused: false,
                    },
                    initial_admin: Context.primaryAddress,
                },
                frozen: false,
                max_trading_offset_secs: 0,
                min_mint_price: {
                    amount: "0",
                    denom: "inj"
                },
                mint_fee_bps: 0
            },
            cw721_contract_label: "DEGA Collection - Test Collection"
        };

        const instantiateContractMsg = MsgInstantiateContract.fromJSON({
            sender: Context.primaryAddress,
            admin: Context.primaryAddress,
            codeId: Config.MINTER_CODE_ID,
            label: "DEGA Minter - Test Collection",
            msg: instantiateMinterMsg,
        });


        const response = await Context.primaryBroadcaster.broadcast({
            msgs: instantiateContractMsg,
            gas: {
                gasPrice: Context.gasPricesAmountWei.toFixed(),
                gas: Context.gasAmountWei.toNumber()
            }
        })

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




    }, 15000);

    it('should mint an NFT successfully', async () => {


        let nft_price_base = new BigNumberInBase (0.5);
        let nft_price_wei = nft_price_base.toWei();

        const nowInSeconds: number = Math.floor(Date.now() / 1000);

        const startTimeInSeconds: number = nowInSeconds - 5; // 5 seconds ago
        //const startTimeInSeconds: number = nowInSeconds + 60; // 60 seconds from now (intentional error)

        const endTimeInSeconds: number = nowInSeconds + 60 * 5; // 5 minutes from now

        //const endTimeInSeconds: number = nowInSeconds + 8; // 8 seconds from now (intentional error)
        //await sleep(12); // wait 12 seconds

        let mintRequestMsg: MintRequest = {
            to: testAddressOne,
            primary_sale_recipient: testAddressTwo,
            uri: "https://example.com",
            price: nft_price_wei.toFixed(),
            currency: "inj",
            //currency: "other",
            validity_start_timestamp: startTimeInSeconds.toString(),
            validity_end_timestamp: endTimeInSeconds.toString(),
            uuid: uuidv4(),
            //uuid: "8c288b70-dc7b-47d6-9412-1840f8c25a57"
        };

        //let rawTextMessage = "test message";
        //let rawMessage = Buffer.from(rawTextMessage, "utf-8");

        let rawMessage = Buffer.from(toBase64(mintRequestMsg), "base64")
        let msgMd5Hash = Buffer.from(sha256(rawMessage))
        let signature = Buffer.from(secp256k1.ecdsaSign(msgMd5Hash, testSignerSigningKey).signature)


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
            await localChainGrpcWasmApi.fetchSmartContractState(
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
            sender: testAddressTransactor,
            contractAddress: Config.MINTER_ADDRESS,
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

        const response = await testBroadcasterTransactor.broadcast({
            msgs: execMsg,
            gas: Context.gasSettings,
        })

        expect(response.code).toEqual(0);
    }, 15000);
});