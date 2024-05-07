import path from "node:path"
//import {exec} from "child_process"
import * as fs from "fs"
import {spawn} from 'child_process'
import {
    AccessType,
    MsgBroadcasterWithPk,
    MsgInstantiateContract,
    MsgMigrateContract,
    MsgStoreCode, MsgSubmitTextProposal,
    PrivateKey
} from "@injectivelabs/sdk-ts"
import * as t from 'io-ts'
import { isLeft } from 'fp-ts/lib/Either'
import {Network, getNetworkEndpoints} from "@injectivelabs/networks"
import {BigNumberInWei} from "@injectivelabs/utils"
import {ChainId} from "@injectivelabs/ts-types"
import {DegaMinterInstantiateMsg} from "./messages"
import * as util from 'util';
import {DegaMinterMigrateMsg} from "./messages/dega_minter_migrate";
import {DegaCw721MigrateMsg} from "./messages/dega_cw721_migrate";


// Paths
const pathsWorkspace = path.resolve(__dirname, "../../..")
const pathsWorkspaceArtifacts = path.join(pathsWorkspace, "artifacts")
const pathsDeploy = path.join(pathsWorkspace, "deploy")
const pathsDeployArtifacts = path.join(pathsDeploy, "artifacts")
const pathsDeploySpecs = path.join(pathsDeploy, "specs")
const pathsDeployPrivateKeys = path.join(pathsDeploy, "private-keys")
const pathsOutputFile = path.join(pathsDeployArtifacts, 'deploy-output.json')
const pathsLogFile = path.join(pathsDeployArtifacts, 'deploy-log.txt')
const pathsErrorFile = path.join(pathsDeployArtifacts, 'deploy-error.txt')

class ScriptError {
    constructor(message: string) {
        this.message = "Deploy Script Error: " + message
    }

    message: string
}

function main() {

    (async () => {

        try {
            await runMain()
        } catch (e) {

            console.error("Error while deploying: ")

            if (e instanceof ScriptError) {
                console.error(e.message)
            } else {
                console.error(e)
            }

            fs.writeFileSync(pathsErrorFile, util.inspect(e))

            process.exit(1)
        }

    })()
}

function teeLogfile() {

    if (fs.existsSync(`${pathsLogFile}`)) {
        fs.rmSync(`${pathsLogFile}`)
    }

    const logStream = fs.createWriteStream(pathsLogFile, { flags: 'a' });

    console.log = function(msg: any) {
        logStream.write(util.format(msg) + '\n');
        process.stdout.write(util.format(msg) + '\n');
    };

    console.error = function(msg: any) {
        logStream.write(util.format(msg) + '\n');
        process.stderr.write(util.format(msg) + '\n');
    };
}

async function runMain() {

    if (fs.existsSync(pathsDeployArtifacts)) {

        if (fs.existsSync(`${pathsOutputFile}`)) {
            fs.rmSync(`${pathsOutputFile}`)
        }

        if (fs.existsSync(`${pathsErrorFile}`)) {
            fs.rmSync(`${pathsErrorFile}`)
        }

    } else {
        fs.mkdirSync(`${pathsDeployArtifacts}`)
    }

    teeLogfile()

    const makeFilePath = path.join(pathsWorkspace, "Makefile.toml")

    if (!(fs.existsSync(makeFilePath))) {
        throw new Error("Not in correct directory. Deploy script must be run from deploy-tool/dist" +
            "directory relative to the workspace root.")
    }

    const useCommand = false
    let command = "deploy" // default to deploy

    let args = new Array<string>()

    // Find the index of the argument containing the filename
    let filenameIndex = process.argv.findIndex(arg => arg.includes('deploy.js'))
    if (filenameIndex !== -1) {
        // Get all the remaining arguments after the filename

        args = process.argv.slice(filenameIndex + 1)

        if (useCommand) {
            let shift_result = args.shift()
            if (shift_result != undefined) {
                command = shift_result
            }
        }

    } else {
        throw new ScriptError("Missing filename argument")
    }

    if (useCommand) {
        console.log("deploy-tool command: " + command)
    }

    console.log("deploy-tool args: " + args)

    let specPath = ""

    if (args.length > 0) {
        specPath = args[0]
    } else {
        throw new ScriptError("Missing spec file argument")
    }

    let deploySpecResult = loadSpec(specPath)

    if (isLeft(deploySpecResult)) {
        throw new ScriptError('Invalid data:' + deploySpecResult.left)
    }

    const spec: DeploySpec = deploySpecResult.right
    console.log('Loaded deploy spec:')
    console.log(spec)

    const context = await makeContext(spec)

    if (useCommand) {
        switch (command) {
            case "deploy":
            case "d":
                await deploy(context)
                break
            default:
                console.log("Unknown command: " + command)
                break
        }
    } else {
        await deploy(context)
    }
}


const govProposalSpec = t.type({
})

type GovProposalSpec = t.TypeOf<typeof govProposalSpec>

const deploySpec = t.type({
    privateKeyFilename: t.string,
    network: t.keyof({
        Local: null,
        Testnet: null,
        Mainnet: null
    }),
    grpcEndpoint: t.union([t.string, t.undefined, t.null]),
    optionsBuildAndOptimize: t.boolean,
    optionsStoreCodeForMinter: t.boolean,
    optionsGovernanceProposalForMinter: t.union([t.boolean, t.undefined, t.null]),
    govProposalSpecForMinter: t.union([govProposalSpec, t.undefined, t.null]),
    preExistingMinterCodeId: t.union([t.number, t.undefined, t.null]),
    optionsStoreCodeForCw721: t.boolean,
    optionsGovernanceProposalForCw721: t.union([t.boolean, t.undefined, t.null]),
    govProposalSpecForCw721: t.union([govProposalSpec, t.undefined, t.null]),
    preExistingCw721CodeId: t.union([t.number, t.undefined, t.null]),
    optionsInstantiate: t.boolean,
    optionsMigrateMinter: t.boolean,
    optionsMigrateCw721: t.boolean,
    collectionName: t.string,
    collectionSymbol: t.string,
    collectionCreator: t.string,
    collectionDescription: t.string,
    collectionImageURL: t.string,
    collectionExternalLinkURL: t.string,
    collectionExplicitContent: t.union([t.boolean, t.undefined, t.null]),
    collectionStartTradingTime: t.union([t.string, t.undefined, t.null]),
    collectionSecondaryRoyaltyPaymentAddress: t.string,
    collectionSecondaryRoyaltyShare: t.string,
    cw721ContractLabel: t.string,
    cw721ContractMigratable: t.boolean,
    cw721MigrateAdmin: t.union([t.string, t.undefined, t.null]),
    cw721AddressForMigration: t.union([t.string, t.undefined, t.null]),
    minterSignerPubKeyBase64: t.string,
    minterMintingPaused: t.boolean,
    minterInitialAdmin: t.string,
    minterContractLabel: t.string,
    minterContractMigratable: t.boolean,
    minterMigrateAdmin: t.union([t.string, t.undefined, t.null]),
    minterAddressForMigration: t.union([t.string, t.undefined, t.null]),
})

type DeploySpec = t.TypeOf<typeof deploySpec>

function loadSpec(specPath: string) {

    const fullSpecPath = path.join(pathsDeploySpecs, specPath)
    const fileContents = fs.readFileSync(fullSpecPath, 'utf-8')
    const jsonData = JSON.parse(fileContents)
    return deploySpec.decode(jsonData)
}


interface DeployContext {
    spec: DeploySpec
    output: DeployOutput
    deployTxPrivateKey: PrivateKey
    deployTxAddress: string
    deployTxBroadcaster: MsgBroadcasterWithPk
    gasPricesAmountWei: BigNumberInWei
    gasAmountWei: BigNumberInWei
    gasSettings: {gasPrice: string, gas: number}
}

const privateKeyDef = t.type({
    format: t.keyof({
        Mnemonic: null,
        SeedHex: null
    }),
    key: t.string
})

type PrivateKeyDef = t.TypeOf<typeof privateKeyDef>;

async function makeContext(spec: DeploySpec): Promise<DeployContext> {

    let deployTxPrivateKey: PrivateKey = await loadPrivateKey(spec)

    const deployTxAddress = deployTxPrivateKey.toBech32()

    let network: Network = Network.Local

    if (spec.network === "Local") {
        network = Network.Local
    } else if (spec.network === "Testnet") {
        network = Network.Testnet
    } else if (spec.network === "Mainnet") {
        network = Network.Mainnet
    } else {
        throw new ScriptError("Invalid network")
    }

    let endpoints = getNetworkEndpoints(network)
    if (spec.grpcEndpoint != undefined) {
        endpoints.grpc = spec.grpcEndpoint
    }

    const deployTxBroadcaster = new MsgBroadcasterWithPk({
        privateKey: deployTxPrivateKey, /** private key hash or PrivateKey class from sdk-ts */
        network: network,
        endpoints: endpoints,
    })
    if (spec.network === "Local") {
        deployTxBroadcaster.chainId = ChainId.Mainnet // Default config of localnet uses a chainId of 1 (same as mainnet)
    }

    const gasPricesAmountWei = new BigNumberInWei(500000000)
    const gasAmountWei = new BigNumberInWei(20000000)

    const gasSettings: {gasPrice: string, gas: number} = {
        gasPrice: gasPricesAmountWei.toFixed(),
        gas: gasAmountWei.toNumber(),
    }

    return {
        spec: spec,
        output: {
            minterCodeIdStored: null,
            cw721CodeIdStored: null,
            minterCodeIdInstantiated: null,
            cw721CodeIdInstantiated: null,
            minterCodeIdMigrated: null,
            cw721CodeIdMigrated: null,
            minterAddress: null,
            cw721Address: null,
        },
        deployTxPrivateKey: deployTxPrivateKey,
        deployTxAddress: deployTxAddress,
        deployTxBroadcaster: deployTxBroadcaster,
        gasPricesAmountWei: gasPricesAmountWei,
        gasAmountWei: gasAmountWei,
        gasSettings: gasSettings,
    }
}

async function loadPrivateKey(spec: DeploySpec): Promise<PrivateKey> {
    const privateKeyFilePath = path.join(pathsDeployPrivateKeys, spec.privateKeyFilename);
    const fileContents = fs.readFileSync(privateKeyFilePath, 'utf-8');
    const jsonData = JSON.parse(fileContents);
    const result = privateKeyDef.decode(jsonData);

    if (isLeft(result)) {
        throw new Error('Invalid private key definition data:' + result.left);
    }

    const privateKeyData: PrivateKeyDef = result.right;
    let privateKey: PrivateKey;

    if (privateKeyData.format === "Mnemonic") {
        privateKey = PrivateKey.fromMnemonic(privateKeyData.key);
    } else if (privateKeyData.format === "SeedHex") {
        privateKey = PrivateKey.fromHex(privateKeyData.key);
    } else {
        throw new Error("Invalid private key format");
    }

    return privateKey;
}

// Use only null and not undefined so that it's always clear when output values are absent
const deployOutput = t.type({
    minterCodeIdStored: t.union([t.number, t.null]),
    cw721CodeIdStored: t.union([t.number, t.null]),
    minterCodeIdInstantiated: t.union([t.number, t.null]),
    cw721CodeIdInstantiated: t.union([t.number, t.null]),
    minterCodeIdMigrated: t.union([t.number, t.null]),
    cw721CodeIdMigrated: t.union([t.number, t.null]),
    minterAddress: t.union([t.string, t.null]),
    cw721Address: t.union([t.string, t.null]),
})

type DeployOutput = t.TypeOf<typeof deployOutput>

function getMinterAddressForMigrate(context: DeployContext) {

        if (context.spec.minterAddressForMigration == undefined) {
            throw new ScriptError("If migrating must specify a minter address for migration with minterAddressForMigration option")
        }

        return context.spec.minterAddressForMigration
}

function getCw721AddressForMigrate(context: DeployContext) {

        if (context.spec.cw721AddressForMigration == undefined) {
            throw new ScriptError("If migrating must specify a cw721 address for migration with cw721AddressForMigration option")
        }

        return context.spec.cw721AddressForMigration

}

async function migrate(context: DeployContext) {
    if (context.spec.optionsMigrateMinter) {

        const minterCodeId = getMinterCodeIdForInstantiateOrMigrate(context);
        const migrateMinterMsg: DegaMinterMigrateMsg = {};
        const minterAddress = getMinterAddressForMigrate(context);

        await migrateContract(
            context,
            minterCodeId,
            migrateMinterMsg,
            minterAddress,
            "DEGA Minter"
        );

        context.output.minterCodeIdMigrated = minterCodeId;
        context.output.minterAddress = minterAddress;
    }

    if (context.spec.optionsMigrateCw721) {

        const migrateCw721Msg: DegaCw721MigrateMsg = {};
        let cw721CodeId = getCw721CodeIdForInstantiateOrMigrate(context);
        const cw721Address = getCw721AddressForMigrate(context);

        await migrateContract(
            context,
            cw721CodeId,
            migrateCw721Msg,
            cw721Address,
            "DEGA CW721"
        );

        context.output.cw721CodeIdMigrated = cw721CodeId;
        context.output.cw721Address = cw721Address;
    }
}



async function deploy(context: DeployContext) {

    const hasMigration = context.spec.optionsMigrateMinter || context.spec.optionsMigrateCw721;

    if (context.spec.optionsInstantiate && hasMigration) {
        throw new ScriptError("Cannot instantiate and migrate in the same deployment")
    }

    if (context.spec.optionsBuildAndOptimize) {
        await buildAndOptimize(context)
    }

    if (context.spec.optionsStoreCodeForMinter) {
        await storeWasm(context, "dega_minter.wasm")
    }

    if (context.spec.optionsGovernanceProposalForMinter) {
        if (context.spec.govProposalSpecForMinter == undefined) {
            throw new ScriptError("Must specify a governance proposal spec via govProposalSpecForMinter " +
                " to use the optionsGovernanceProposalForMinter option")
        }
        await governanceProposal(context, "dega_minter.wasm", context.spec.govProposalSpecForMinter)
    }

    if (context.spec.optionsGovernanceProposalForCw721) {
        if (context.spec.govProposalSpecForCw721 == undefined) {
            throw new ScriptError("Must specify a governance proposal spec via govProposalSpecForCw721 " +
                "to use the optionGovernanceProposalForCw721 option")
        }
        await governanceProposal(context, "dega_minter.wasm", context.spec.govProposalSpecForCw721)
    }

    if (context.spec.optionsStoreCodeForCw721) {
        await storeWasm(context, "dega_cw721.wasm")
    }

    if (context.spec.optionsInstantiate) {
        await instantiate(context)
    } else {
        await migrate(context);
    }

    await output(context)
}

async function buildAndOptimize(context: DeployContext) {

    // Delete any binaries that may have been left over by the CLI
    if (fs.existsSync(pathsWorkspaceArtifacts)) {
        await run(context, "rm", [`${pathsWorkspaceArtifacts}/*`])
    }

    // Run the production optimize tool from cosm-wasm
    await run(context, "cargo", ["make", "optimize"])

    // Delete any binaries that may be left over from the last deployment attempt
    if (fs.existsSync(pathsDeployArtifacts)) {
        await run(context, "rm", [`${pathsDeployArtifacts}/*.wasm`])
        const checksumsPath = path.join(pathsDeployArtifacts, "checksums.txt")
        if (fs.existsSync(checksumsPath)) {
            fs.rmSync(`${pathsDeployArtifacts}/checksums.txt`)
        }
    }

    // Move the optimized binaries to a distinct artifacts directory for deployments
    await run(context, "mv", [`${pathsWorkspaceArtifacts}/*`, `${pathsDeployArtifacts}`])
}


async function storeWasm(context: DeployContext, wasm_name: string) {

    const wasmPath = path.join(pathsDeployArtifacts, wasm_name)
    const wasmBytes = new Uint8Array(Array.from(fs.readFileSync(wasmPath)))

    const storeCodeMsg = MsgStoreCode.fromJSON({
        sender: context.deployTxAddress,
        wasmBytes: wasmBytes
    })

    console.log("Storing code for: " + wasm_name)
    console.log("")

    const response = await context.deployTxBroadcaster.broadcast({
        msgs: storeCodeMsg,
        gas: context.gasSettings,
    })

    //console.log(response)

    console.log("Successfully Stored Code")

    if (response.events != undefined) {
        let decoder = new TextDecoder()

        response.events.forEach((event: any) => {
            let eventTyped: TxEvent = event as TxEvent
            if (eventTyped.type == "cosmwasm.wasm.v1.EventCodeStored") {
                eventTyped.attributes.forEach((attr: TxAttribute) => {
                    const key = decoder.decode(attr.key)
                    const value = decoder.decode(attr.value)
                    console.log(key + ": " + value)
                    if (key == "code_id") {
                        if (wasm_name == "dega_minter.wasm") {
                            context.output.minterCodeIdStored = parseInt(stripQuotes(value))
                        } else if (wasm_name == "dega_cw721.wasm") {
                            context.output.cw721CodeIdStored = parseInt(stripQuotes(value))
                        }
                    }
                })
            }

        })
        console.log("")
    }
}

async function governanceProposal(context: DeployContext, wasm_name: string, govProposalSpecForMinter: GovProposalSpec) {

    const wasmPath = path.join(pathsDeployArtifacts, wasm_name)

    console.log("Creating governance proposal for: " + wasm_name)

    // Currently WIP in the test tool
}


function getCw721CodeIdForInstantiateOrMigrate(context: DeployContext) {

    if (context.spec.optionsStoreCodeForCw721) {
        if (context.output.cw721CodeIdStored == undefined) {
            throw new ScriptError("Missing cw721 code_id after storing")
        }

        return context.output.cw721CodeIdStored;

    } else if (context.spec.preExistingCw721CodeId == undefined) {
        throw new ScriptError("Must specify a pre-existing cw721 code_id if not storing cw721 code")
    } else {
        return context.spec.preExistingCw721CodeId;
    }
}

function getMinterCodeIdForInstantiateOrMigrate(context: DeployContext) {

    if (context.spec.optionsStoreCodeForMinter) {
        if (context.output.minterCodeIdStored == undefined) {
            throw new ScriptError("Missing minter code_id after storing")
        }

        return context.output.minterCodeIdStored;

    } else if (context.spec.preExistingMinterCodeId == undefined) {
        throw new ScriptError("Must specify a pre-existing minter code_id if not storing minter code")
    } else {
        return context.spec.preExistingMinterCodeId;
    }
}


async function instantiate(context: DeployContext) {

    const minterCodeId = getMinterCodeIdForInstantiateOrMigrate(context);
    const cw721CodeId = getCw721CodeIdForInstantiateOrMigrate(context);

    let cw721MigrateAdmin: string | null | undefined = null;

    if (context.spec.cw721ContractMigratable) {

        cw721MigrateAdmin = context.spec.cw721MigrateAdmin;

        if (cw721MigrateAdmin == undefined) {
            throw new ScriptError("Must specify a cw721 migrate admin to make cw721 contract migratable")
        }
    } else if (context.spec.cw721MigrateAdmin != undefined) {
        throw new ScriptError("Specified cw721 migrate admin when cw721 contract is not migratable")
    }


    // collectionExternalLinkURL: t.string,
    //     collectionExplicitContent: t.union([t.boolean, t.undefined, t.null]),
    //     collectionStartTradingTime: t.union([t.number, t.undefined, t.null]),
    //     collectionSecondaryRoyaltyPaymentAddress: t.string,
    //     collectionSecondaryRoyaltyShare: t.number,

    let royalty_info = null;

    if (context.spec.collectionSecondaryRoyaltyPaymentAddress != undefined &&
        context.spec.collectionSecondaryRoyaltyShare != undefined) {
        royalty_info = {
            payment_address: context.spec.collectionSecondaryRoyaltyPaymentAddress,
            share: context.spec.collectionSecondaryRoyaltyShare,
        };
    }

    const instantiateMinterMsg: DegaMinterInstantiateMsg = {
        collection_params: {
            code_id: cw721CodeId,
            name: context.spec.collectionName,
            symbol: context.spec.collectionSymbol,
            info: {
                creator: context.spec.collectionCreator,
                description: context.spec.collectionDescription,
                image: context.spec.collectionImageURL,
                external_link: context.spec.collectionExternalLinkURL,
                explicit_content: context.spec.collectionExplicitContent,
                start_trading_time: context.spec.collectionStartTradingTime,
                royalty_info: royalty_info,
            },

        },
        minter_params: {
            creation_fee: {
                amount: "0",
                denom: "inj"
            },
            extension: {
                dega_minter_settings: {
                    signer_pub_key: context.spec.minterSignerPubKeyBase64,
                    minting_paused: context.spec.minterMintingPaused,
                },
                initial_admin: context.spec.minterInitialAdmin,
            },
            frozen: false,
            max_trading_offset_secs: 0,
            min_mint_price: {
                amount: "0",
                denom: "inj"
            },
            mint_fee_bps: 0
        },
        cw721_contract_label: context.spec.cw721ContractLabel,
        cw721_contract_admin: cw721MigrateAdmin,
    }


    console.log("InstantiateMsg : ")
    console.log(instantiateMinterMsg)
    console.log("")

    let minterMigrateAdmin: string = "";

    if (context.spec.minterContractMigratable) {

        if (context.spec.minterMigrateAdmin == undefined) {
            throw new ScriptError("Must specify a minter migrate admin to make minter contract migratable")
        } else {
            minterMigrateAdmin = context.spec.minterMigrateAdmin;
        }
    } else if (context.spec.minterMigrateAdmin != undefined) {
        throw new ScriptError("Specified minter migrate admin when minter contract is not migratable")
    }

    const instantiateContractMsg = MsgInstantiateContract.fromJSON({
        sender: context.deployTxAddress,
        admin: minterMigrateAdmin,
        codeId: minterCodeId,
        label: context.spec.minterContractLabel,
        msg: instantiateMinterMsg,
    })

    console.log("Instantiating code for Dega Minter")
    console.log("")

    const response = await context.deployTxBroadcaster.broadcast({
        msgs: instantiateContractMsg,
        gas: context.gasSettings
    })

    //console.log(response)

    console.log("Successfully Instantiated Minter and Collection contracts")
    console.log("TX: " + response.txHash)


    context.output.minterCodeIdInstantiated = minterCodeId;
    context.output.cw721CodeIdInstantiated = cw721CodeId;

    if (response.events != undefined) {
        let decoder = new TextDecoder()

        response.events.forEach((event: any) => {
            let eventTyped: TxEvent = event as TxEvent
            if (eventTyped.type == "cosmwasm.wasm.v1.EventContractInstantiated") {
                let is_minter = false
                let is_cw721 = false
                let address = ""
                eventTyped.attributes.forEach((attr: TxAttribute) => {
                    let key = decoder.decode(attr.key)
                    let value = decoder.decode(attr.value)
                    if (key == "code_id" && stripQuotes(value) == minterCodeId.toString()) {
                        is_minter = true
                    }
                    if (key == "code_id" && stripQuotes(value) == cw721CodeId.toString()) {
                        is_cw721 = true
                    }
                    if (key == "contract_address") {
                        address = value
                    }
                })

                if (is_minter && is_cw721) {
                    throw new Error("Both minter and cw721 contract code_ids found in instantiated event")
                }

                if (is_minter) {
                    context.output.minterAddress = stripQuotes(address)
                    console.log("Minter Address: " + stripQuotes(address))
                } else if (is_cw721) {
                    context.output.cw721Address = stripQuotes(address)
                    console.log("CW721 Address: " + stripQuotes(address))
                }
            }

        })
        console.log("")
    }
}


async function migrateContract(
    context: DeployContext,
    codeId: number,
    migrateMessage: object,
    contractAddress: string,
    contractName: string,
) {

    const migrateContractMsg = MsgMigrateContract.fromJSON({
        sender: context.deployTxAddress,
        codeId: codeId,
        msg: migrateMessage,
        contract: contractAddress,
    });

    console.log(`Migrating code for ${contractName}`);
    console.log("");

    const response = await context.deployTxBroadcaster.broadcast({
        msgs: migrateContractMsg,
        gas: context.gasSettings
    });

    console.log(`Successfully Migrated ${contractName}`)

    console.log("TX: " + response.txHash)
    console.log("");

}

async function output(context: DeployContext) {

    console.log(`Output:`)
    console.log(context.output)

    const outputData = JSON.stringify(context.output, null, 2)
    fs.writeFileSync(pathsOutputFile, outputData)


    console.log("")
    console.log(`Output written to ${pathsOutputFile}`)
    console.log("")
    console.log(`Deploy log written to ${pathsLogFile}`)
    console.log("")
}


function stripQuotes(input: string): string {
    if (input.startsWith('"') && input.endsWith('"')) {
        return input.slice(1, -1)
    }
    return input
}


async function run(context: DeployContext, command: string, args: string[] = []) {

    console.log("RUN: " + command + " " + args.join(" "))

    let childProcess = spawn(command, args, {
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true,
        cwd: pathsWorkspace,
        detached: false
    })

    childProcess.stdout.on('data', (data) => {
        process.stdout.write(data);
        fs.appendFileSync(pathsLogFile, data);
    });

    childProcess.stderr.on('data', (data) => {
        process.stderr.write(data);
        fs.appendFileSync(pathsLogFile, data);
    });

    // let exitChild = function(childProcess: ChildProcess, signal: string) {
    //     // do some stuff here
    //     childProcess.kill()
    // }

    // process.on('SIGINT', exitChild)
    // process.on('SIGTERM', exitChild)
    // process.on('SIGQUIT', exitChild)
    // process.on('SIGKILL', exitChild)

    await new Promise( (resolve) => {
        childProcess.on('close', resolve)
    })
}


interface TxEvent {
    type: string,
    attributes: TxAttribute[],
}

interface TxAttribute {
    key: Uint8Array,
    value: Uint8Array,
}


main()