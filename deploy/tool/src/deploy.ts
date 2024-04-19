import path from "node:path"
//import {exec} from "child_process"
import * as fs from "fs"
import {spawn} from 'child_process'
import {MsgBroadcasterWithPk, MsgInstantiateContract, MsgStoreCode, PrivateKey} from "@injectivelabs/sdk-ts"
import * as t from 'io-ts'
import { isLeft } from 'fp-ts/lib/Either'
import {Network, getNetworkEndpoints} from "@injectivelabs/networks"
import {BigNumberInWei} from "@injectivelabs/utils"
import {ChainId} from "@injectivelabs/ts-types"
import {DegaMinterInstantiateMsg} from "./messages"
import * as util from 'util';


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

function main() {

    (async () => {

        try {
            await runMain()
        } catch (e) {

            console.error("Error while deploying: ")
            console.error(e)

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
        exitWithError("Missing filename argument")
    }

    if (useCommand) {
        console.log("deploy-tool command: " + command)
    }

    console.log("deploy-tool args: " + args)

    let specPath = ""

    if (args.length > 0) {
        specPath = args[0]
    } else {
        exitWithError("Missing spec file argument")
    }

    let deploySpecResult = loadSpec(specPath)

    if (isLeft(deploySpecResult)) {
        exitWithError('Invalid data:' + deploySpecResult.left)
        return
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


const deploySpec = t.type({
    privateKeyFilename: t.string,
    network: t.keyof({
        Local: null,
        Testnet: null,
        Mainnet: null
    }),
    grpcEndpoint: t.union([t.string, t.undefined, t.null]),
    optionsBuild: t.boolean,
    optionsOptimize: t.boolean,
    optionsStoreCodeForMinter: t.boolean,
    preExistingMinterCodeId: t.union([t.number, t.undefined, t.null]),
    optionsStoreCodeForCw721: t.boolean,
    preExistingCw721CodeId: t.union([t.number, t.undefined, t.null]),
    optionsInstantiate: t.boolean,
    collectionName: t.string,
    collectionSymbol: t.string,
    collectionCreator: t.string,
    collectionDescription: t.string,
    collectionImageURL: t.string,
    cw721ContractLabel: t.string,
    minterSignerPubKeyBase64: t.string,
    minterBurningPaused: t.boolean,
    minterMintingPaused: t.boolean,
    minterTransferringPaused: t.boolean,
    minterInitialAdmin: t.string,
    minterContractLabel: t.string,
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
        throw new Error("Invalid network")
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
            minterCodeId: null,
            cw721CodeId: null,
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
    minterCodeId: t.union([t.number, t.null]),
    cw721CodeId: t.union([t.number, t.null]),
    minterAddress: t.union([t.string, t.null]),
    cw721Address: t.union([t.string, t.null]),
})

type DeployOutput = t.TypeOf<typeof deployOutput>

async function deploy(context: DeployContext) {

    if (context.spec.optionsBuild) {
        await build(context)
    }

    if (context.spec.optionsOptimize) {
        await optimize(context)
    }

    await store(context)

    if (context.spec.optionsInstantiate) {
        await instantiate(context)
    }

    await output(context)
}

async function build(context: DeployContext) {

    await run(context, "cargo", ["make", "build"])
}

async function optimize(context: DeployContext) {

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

async function store(context: DeployContext) {

    if (context.spec.optionsStoreCodeForMinter) {
        await store_wasm(context, "dega_minter.wasm")
    }

    if (context.spec.optionsStoreCodeForCw721) {
        await store_wasm(context, "dega_cw721.wasm")
    }
}


async function store_wasm(context: DeployContext, wasm_name: string) {

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
                            context.output.minterCodeId = parseInt(stripQuotes(value))
                        } else if (wasm_name == "dega_cw721.wasm") {
                            context.output.cw721CodeId = parseInt(stripQuotes(value))
                        }
                    }
                })
            }

        })
        console.log("")
    }
}



async function instantiate(context: DeployContext) {

    if (!context.spec.optionsStoreCodeForMinter && context.spec.preExistingMinterCodeId == undefined) {
        exitWithError("Must specify a pre-existing minter code_id if not storing minter code")
        return
    }

    if (!context.spec.optionsStoreCodeForCw721 && context.spec.preExistingCw721CodeId == undefined) {
        exitWithError("Must specify a pre-existing cw721 code_id if not storing cw721 code")
        return
    }

    const minterCodeId =
        context.spec.optionsStoreCodeForMinter ?
        context.output.minterCodeId :
        context.spec.preExistingMinterCodeId

    const cw721CodeId =
        context.spec.optionsStoreCodeForCw721 ?
            context.output.cw721CodeId :
            context.spec.preExistingCw721CodeId

    if (minterCodeId == undefined || cw721CodeId == undefined) {
        exitWithError("Missing minter or cw721 code_id")
        return
    }

    const instantiateMinterMsg: DegaMinterInstantiateMsg = {
        collection_params: {
            code_id: cw721CodeId,
            name: context.spec.collectionName,
            symbol: context.spec.collectionSymbol,
            info: {
                creator: context.spec.collectionCreator,
                description: context.spec.collectionDescription,
                image: context.spec.collectionImageURL
            },
        },
        minter_params: {
            allowed_sg721_code_ids: [],
            creation_fee: {
                amount: "0",
                denom: "inj"
            },
            extension: {
                dega_minter_settings: {
                    signer_pub_key: context.spec.minterSignerPubKeyBase64,
                    burning_paused: context.spec.minterBurningPaused,
                    minting_paused: context.spec.minterMintingPaused,
                    transferring_paused: context.spec.minterTransferringPaused
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
        cw721_contract_label: context.spec.cw721ContractLabel
    }


    console.log("InstantiateMsg : ")
    console.log(instantiateMinterMsg)
    console.log("")

    const instantiateContractMsg = MsgInstantiateContract.fromJSON({
        sender: context.deployTxAddress,
        admin: context.spec.minterInitialAdmin,
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

function exitWithError(error: string) {
    console.error(error)
    process.exit(1)
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