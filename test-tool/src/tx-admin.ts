import excess from "io-ts-excess";
import * as t from "io-ts";
import {AppContext, getAppContext} from "./context";
import {DegaCw721ExecuteMsg, DegaMinterExecuteMsg} from "./messages";
import {UpdateAdminCommand, UpdateDegaMinterConfigSettingsMsg} from "./messages/dega_minter_execute";
import {MsgExecuteContractCompat} from "@injectivelabs/sdk-ts";
import {Config, pathsTestToolArtifacts} from "./config";
import {execSync} from "child_process";
import {logObjectFullDepth} from "./tests/setup";
import fs from "fs";
import path from "node:path";
import {logResponse} from "./tx";
import {UpdateCollectionInfoMsg} from "./messages/dega_cw721_execute";
import {isLeft} from "fp-ts/Either";
import {failure} from "io-ts/PathReporter";

const collectionInfoUpdateSpecDef = excess(t.type({
    description: t.union([t.string, t.undefined, t.null]),
    external_link: t.union([t.string, t.undefined, t.null]),
    image: t.union([t.string, t.undefined, t.null]),
    royalty_settings: t.union([t.undefined, t.null,
        t.type({
            payment_address: t.string,
            share: t.string
        })
    ]),
}, "CollectionInfoUpdateSpec"));


type CollectionInfoUpdateSpec = t.TypeOf<typeof collectionInfoUpdateSpecDef>;


export async function updateCollectionInfo(args: string[]) {

    const context = await getAppContext();

    const usage = "Usage: tx update-collection-info <info-spec-path> [--generate <sender-address>]";

    const specPathArg = args.shift();
    if (!specPathArg) {
        throw new Error(`Missing deploy spec path argument`);
    }

    const specPath = path.resolve(process.cwd(), specPathArg);
    if (!fs.existsSync(specPath)) {
        throw new Error(`Update Collection Info Spec path does not exist: ${specPath}`);
    }

    const specContents = fs.readFileSync(specPath, 'utf-8');
    const jsonData = JSON.parse(specContents)
    const infoSpec: CollectionInfoUpdateSpec  = decode(collectionInfoUpdateSpecDef, jsonData);

    const updateInfoMsg: UpdateCollectionInfoMsg = infoSpec;

    const contractMsg: DegaCw721ExecuteMsg = {
        update_collection_info: {
            collection_info: updateInfoMsg
        }
    };


    const maybeSenderAddress = checkForGenerateArg(args, usage);
    if (maybeSenderAddress) {
        generateCollectionExecuteMessage(context, contractMsg, maybeSenderAddress, "add-admin");
    } else {
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
}

export async function addAdmin(args: string[]) {

    const context = await getAppContext();

    const usage = "Usage: tx add-admin <new-admin-address> [--generate <sender-address>]";

    const newAdminAddress = args.shift();
    if (!newAdminAddress) {
        throw new Error(`Missing argument. ${usage}`);
    }

    const contractMsg: DegaMinterExecuteMsg = {
        update_admin: {
            address: newAdminAddress,
            command: UpdateAdminCommand.Add,
        }
    };

    const maybeSenderAddress = checkForGenerateArg(args, usage);
    if (maybeSenderAddress) {
        generateMinterExecuteMessage(context, contractMsg, maybeSenderAddress, "add-admin");
    } else {
        const execMsg = MsgExecuteContractCompat.fromJSON({
            sender: context.primaryAddress,
            contractAddress: context.minterAddress,
            msg: contractMsg,
            funds: []
        })

        const response = await context.primaryBroadcaster.broadcast({
            msgs: execMsg,
            gas: context.gasSettings,
        })

        logResponse(response);
    }
}


export async function removeAdmin(args: string[]) {

    const context = await getAppContext();

    const usage = "Usage: tx remove-admin <revoked-admin-address> [--generate <sender-address>]";

    const revokedAdminAddress = args.shift();
    if (!revokedAdminAddress) {
        throw new Error(`Missing argument. ${usage}`);
    }

    const contractMsg: DegaMinterExecuteMsg = {
        update_admin: {
            address: revokedAdminAddress,
            command: UpdateAdminCommand.Remove,
        }
    };

    const maybeSenderAddress = checkForGenerateArg(args, usage);
    if (maybeSenderAddress) {
        generateMinterExecuteMessage(context, contractMsg, maybeSenderAddress, "remove-admin");
    } else {
        const execMsg = MsgExecuteContractCompat.fromJSON({
            sender: context.primaryAddress,
            contractAddress: context.minterAddress,
            msg: contractMsg,
            funds: []
        })

        const response = await context.primaryBroadcaster.broadcast({
            msgs: execMsg,
            gas: context.gasSettings,
        })

        logResponse(response);
    }
}

export async function setMintSigner(args: string[]) {

    const context = await getAppContext();

    const usage = "Usage: tx set-mint-signer <new-signing-key> [--generate <sender-address>]";

    const newSigningKeyBase64 = args.shift();
    if (!newSigningKeyBase64) {
        throw new Error(`Missing argument. ${usage}`);
    }

    const contractMsg: DegaMinterExecuteMsg = {
        update_settings: {
            settings: {
                signer_pub_key: newSigningKeyBase64
            }
        }
    };

    const maybeSenderAddress = checkForGenerateArg(args, usage);
    if (maybeSenderAddress) {
        generateMinterExecuteMessage(context, contractMsg, maybeSenderAddress, "set-mint-signer");
    } else {
        const execMsg = MsgExecuteContractCompat.fromJSON({
            sender: context.primaryAddress,
            contractAddress: context.minterAddress,
            msg: contractMsg,
            funds: []
        })

        const response = await context.primaryBroadcaster.broadcast({
            msgs: execMsg,
            gas: context.gasSettings,
        })

        logResponse(response);
    }
}

export async function pause(args: string[]) {

    const context = await getAppContext();

    const usage = "Usage: tx pause <new-setting> [--generate <sender-address>]";

    const onString = args.shift();
    if (!onString) {
        throw new Error(`Missing argument. ${usage}`);
    }

    if (onString != "true" && onString != "false") {
        throw new Error("Invalid on value. Must be either true or false");
    }

    const newSetting: boolean = (onString == "true");

    const newSettings: UpdateDegaMinterConfigSettingsMsg = {
        minting_paused: newSetting
    };

    const contractMsg: DegaMinterExecuteMsg = {
        update_settings: {
            settings: newSettings
        }
    };

    const maybeSenderAddress = checkForGenerateArg(args, usage);
    if (maybeSenderAddress) {
        generateMinterExecuteMessage(context, contractMsg, maybeSenderAddress, `${newSetting ? "pause" : "unpause"}`);
    } else {
        const execMsg = MsgExecuteContractCompat.fromJSON({
            sender: context.primaryAddress,
            contractAddress: context.minterAddress,
            msg: contractMsg,
            funds: []
        })

        const response = await context.primaryBroadcaster.broadcast({
            msgs: execMsg,
            gas: context.gasSettings,
        })

        logResponse(response);
    }
}


export function checkForGenerateArg(args: string[], usage: string) {

    const generateArg = args.shift();

    if (!generateArg) {
        return;
    }

    if (generateArg && generateArg !== "--generate") {
        throw new Error(`Invalid argument, only --generate followed by sender address accepted. ${usage}`);
    }

    const senderAddress = args.shift();

    if (!senderAddress) {
        throw new Error(`Missing sender after --generate argument. ${usage}`);
    }

    const sampleInjAddress = "inj1dy6zq408day25hvfrjkhsrd7hn6ku38x2f8dm6";
    if (!senderAddress.startsWith("inj") || senderAddress.length != sampleInjAddress.length) {
        throw new Error(`Invalid sender address. ${usage}`);
    }

    return senderAddress;
}

function generateMinterExecuteMessage(
    context: AppContext,
    contractMsg: DegaMinterExecuteMsg,
    senderAddress: string,
    txName: string
) {
    generateExecuteMessage(context, contractMsg, context.minterAddress, senderAddress, txName)
}

function generateCollectionExecuteMessage(
    context: AppContext,
    contractMsg: DegaCw721ExecuteMsg,
    senderAddress: string,
    txName: string
) {
    generateExecuteMessage(context, contractMsg, context.cw721Address, senderAddress, txName)
}

function generateExecuteMessage(
    context: AppContext,
    contractMsg: any,
    contractAddress: string,
    senderAddress: string,
    txName: string
) {

    console.log("Generating transaction");
    console.log("");

    let baseTxArgs = [];
    baseTxArgs.push("injectived");
    baseTxArgs.push("tx");
    baseTxArgs.push("wasm");
    baseTxArgs.push("execute");
    baseTxArgs.push(contractAddress);
    baseTxArgs.push(`'${JSON.stringify(contractMsg)}'`);
    baseTxArgs.push(`--chain-id="${context.chainId}"`);
    baseTxArgs.push(`--from=${senderAddress}`);
    baseTxArgs.push(`--node=${context.cliNode}`);
    baseTxArgs.push(`--gas=auto`);
    baseTxArgs.push(`--gas-adjustment=1.4`);
    baseTxArgs.push(`--gas-prices=500000000inj`);
    baseTxArgs.push(`--generate-only`);

    console.log("Base CLI Tx:");
    console.log(baseTxArgs.join(" "));
    console.log("");

    const injectivedPassword = Config.INJECTIVED_PASSWORD;
    if (!injectivedPassword) {
        throw new Error("Must specify INJECTIVED_PASSWORD in the .env file / environment to generate transactions");
    }

    let fullTxArgs = [];
    fullTxArgs.push("echo");
    fullTxArgs.push(`${injectivedPassword}`);
    fullTxArgs.push(`|`);
    fullTxArgs = fullTxArgs.concat(baseTxArgs);

    //const txJsonStringUnformatted = await run(context, "injectived", generateTxArgs);
    const txJsonStringGenerated = execSync(fullTxArgs.join(" "), {encoding: 'utf-8'});

    console.log("Generated Tx:");
    console.log("================================================");
    logObjectFullDepth(txJsonStringGenerated);
    console.log("================================================");

    if (!fs.existsSync(pathsTestToolArtifacts)) {
        fs.mkdirSync(pathsTestToolArtifacts);
    } else if (fs.readdirSync(pathsTestToolArtifacts).length) {
        execSync(`rm ${pathsTestToolArtifacts}/*`, {encoding: 'utf-8'})
    }

    const txFileName = `${txName}-tx_${Config.NETWORK.toLowerCase()}.json`;
    const txFilePath = path.join(pathsTestToolArtifacts, txFileName);

    console.log("Formatted Tx JSON File: " + txFilePath);

    const txJsonObj = JSON.parse(txJsonStringGenerated);

    fs.writeFileSync(txFilePath, JSON.stringify(txJsonObj, null, 2));
}

function decode<I, A>(type: t.Decoder<I, A>, input: I) {
    const result = type.decode(input)
    if (isLeft(result)) {
        const errors = result.left;
        const errorDetails = failure(errors)
            .map(s => {
                const excessPropIndex = s.search("excess properties");
                if (excessPropIndex != -1) {
                    s = s.slice(excessPropIndex)
                }
                return '- ' + s
            })
            .join('\n');

        const errorMsg =
            `Validation failed for input:

${JSON.stringify(input, null, 2)}

Error details:

${errorDetails}
`;

        throw new Error(errorMsg);
    }

    return result.right;
}