import path from "node:path"
//import {exec} from "child_process"
import * as fs from "fs"
import {exec, execSync, spawn} from 'child_process'
import {
    AccessType,
    MsgBroadcasterWithPk,
    MsgInstantiateContract,
    MsgMigrateContract,
    MsgStoreCode, MsgSubmitTextProposal,
    PrivateKey, sha256, toBase64
} from "@injectivelabs/sdk-ts"
import * as t from 'io-ts'
import excess from "io-ts-excess";
import { isLeft } from 'fp-ts/lib/Either'
import {Network, getNetworkEndpoints} from "@injectivelabs/networks"
import {BigNumberInWei, BigNumberInBase} from "@injectivelabs/utils"
import {ChainId} from "@injectivelabs/ts-types"
import {DegaMinterInstantiateMsg} from "./messages"
import * as util from 'util';
import {DegaMinterMigrateMsg} from "./messages/dega_minter_migrate";
import {DegaCw721MigrateMsg} from "./messages/dega_cw721_migrate";
import {failure} from "io-ts/PathReporter";


// Paths
const pathsWorkspace = path.resolve(__dirname, "../../..")
const pathsWorkspaceArtifacts = path.join(pathsWorkspace, "artifacts")
const pathsWorkspaceArtifactsOptimized = path.join(pathsWorkspace, "artifacts-optimized")
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

export function decode<I, A>(type: t.Decoder<I, A>, input: I) {
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

export function logObjectFullDepth(obj: any) {
    console.log(util.inspect(obj, {showHidden: false, depth: null, colors: true}));
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
        const callerWorkingDirFromEnv = process.env.INIT_CWD;
        if (!callerWorkingDirFromEnv) {
            throw new ScriptError("Missing INIT_CWD in PATH to find the caller's working directory");
        }
        const callerWorkingDir = path.resolve(callerWorkingDirFromEnv);

        const specPathArg = args[0];
        specPath = path.resolve(callerWorkingDir, specPathArg);
        console.log('Spec path: ' + specPath);
    } else {
        throw new ScriptError("Missing spec file argument");
    }

    const spec: DeploySpec = loadSpec(specPath)

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


const govProposalSpec = excess(t.type({
    title: t.string,
    summaryFilePath: t.string,
    proposerAddress: t.string,
    instantiateAddresses: t.union([t.array(t.string), t.undefined, t.null]),
    depositAmountINJ: t.number,
}, "GovProposalSpec"));

type GovProposalSpec = t.TypeOf<typeof govProposalSpec>;

const deploySpec = excess(t.type({
    privateKeyFilename: t.union([t.string, t.undefined, t.null]),
    network: t.keyof({
        Local: null,
        Testnet: null,
        Mainnet: null
    }),
    deployAddress: t.union([t.string, t.undefined, t.null]),
    grpcEndpoint: t.union([t.string, t.undefined, t.null]),
    optionsBuildAndOptimize: t.boolean,
    optionsStoreCodeForMinter: t.boolean,
    preExistingMinterBinary: t.union([t.string, t.undefined, t.null]),
    preExistingMinterBinaryChecksum: t.union([t.string, t.undefined, t.null]),
    optionsGovernanceProposalForMinter: t.union([t.boolean, t.undefined, t.null]),
    govProposalSpecForMinter: t.union([govProposalSpec, t.undefined, t.null]),
    preExistingMinterCodeId: t.union([t.number, t.undefined, t.null]),
    optionsStoreCodeForCw721: t.boolean,
    preExistingCw721Binary: t.union([t.string, t.undefined, t.null]),
    preExistingCw721BinaryChecksum: t.union([t.string, t.undefined, t.null]),
    optionsGovernanceProposalForCw721: t.union([t.boolean, t.undefined, t.null]),
    govProposalSpecForCw721: t.union([govProposalSpec, t.undefined, t.null]),
    preExistingCw721CodeId: t.union([t.number, t.undefined, t.null]),
    optionsInstantiate: t.boolean,
    optionsMigrateMinter: t.boolean,
    optionsMigrateCw721: t.boolean,
    optionsBroadcast: t.union([t.boolean, t.undefined, t.null]),
    collectionName: t.string,
    collectionSymbol: t.string,
    collectionDescription: t.string,
    collectionImageURL: t.string,
    collectionExternalLinkURL: t.string,
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
}, "DeploySpec"));

type DeploySpec = t.TypeOf<typeof deploySpec>

function loadSpec(specPath: string) {

    const fileContents = fs.readFileSync(specPath, 'utf-8')
    const jsonData = JSON.parse(fileContents)
    return decode(deploySpec, jsonData)
}


interface DeployContext {
    spec: DeploySpec
    output: DeployOutput
    chainId: ChainId,
    node: string,
    deployTxPrivateKey: PrivateKey | undefined
    deployTxAddress: string | undefined
    deployTxBroadcaster: MsgBroadcasterWithPk | undefined
    gasPricesAmountWei: BigNumberInWei
    gasAmountWei: BigNumberInWei
    gasSettings: {gasPrice: string, gas: number}
    injectivedPassword: string | null | undefined
}

const privateKeyDef = excess(t.type({
    format: t.keyof({
        Mnemonic: null,
        SeedHex: null
    }),
    key: t.string,
    injectivedPassword: t.union([t.string, t.undefined, t.null]),
}, "PrivateKeyDef"));

type PrivateKeyDef = t.TypeOf<typeof privateKeyDef>;

async function makeContext(spec: DeploySpec): Promise<DeployContext> {

    let [
        deployTxPrivateKey,
        injectivedPasswd
    ] = await loadPrivateKey(spec)



    let network: Network = Network.Local
    let chainId: ChainId;
    let node: string;

    if (spec.network === "Local") {
        network = Network.Local;
        chainId = ChainId.Mainnet; // Local uses the mainnet chainId
        node = "http://localhost:26657";
    } else if (spec.network === "Testnet") {
        network = Network.Testnet
        chainId = ChainId.Testnet;
        node = "https://testnet.sentry.tm.injective.network:443";
    } else if (spec.network === "Mainnet") {
        network = Network.Mainnet
        chainId = ChainId.Mainnet;
        node = "https://sentry.tm.injective.network:443"
    } else {
        throw new ScriptError("Invalid network")
    }

    const endpoints = getNetworkEndpoints(network)
    if (spec.grpcEndpoint != undefined) {
        endpoints.grpc = spec.grpcEndpoint
    }

    let deployTxAddress =
        deployTxPrivateKey != null ?
            deployTxPrivateKey.toBech32() :
            undefined;

    let deployTxBroadcaster;

    if (deployTxPrivateKey != null) {
        deployTxBroadcaster = new MsgBroadcasterWithPk({
            privateKey: deployTxPrivateKey, /** private key hash or PrivateKey class from sdk-ts */
            network: network,
            endpoints: endpoints,
        });
        if (spec.network === "Local") {
            deployTxBroadcaster.chainId = chainId // Default config of localnet uses a chainId of 1 (same as mainnet)
        }
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
            txJsonPath: null,
        },
        chainId: chainId,
        node: node,
        deployTxPrivateKey: deployTxPrivateKey,
        deployTxAddress: deployTxAddress,
        deployTxBroadcaster: deployTxBroadcaster,
        gasPricesAmountWei: gasPricesAmountWei,
        gasAmountWei: gasAmountWei,
        gasSettings: gasSettings,
        injectivedPassword: injectivedPasswd,
    }
}

async function loadPrivateKey(spec: DeploySpec): Promise<[PrivateKey|undefined,string|undefined]> {

    if (spec.privateKeyFilename == null) {
        return [undefined, undefined];
    }

    const privateKeyFilePath = path.join(pathsDeployPrivateKeys, spec.privateKeyFilename);
    const fileContents = fs.readFileSync(privateKeyFilePath, 'utf-8');
    const jsonData = JSON.parse(fileContents);
    const privateKeyData: PrivateKeyDef = decode(privateKeyDef, jsonData);

    let privateKey: PrivateKey;

    if (privateKeyData.format === "Mnemonic") {
        privateKey = PrivateKey.fromMnemonic(privateKeyData.key);
    } else if (privateKeyData.format === "SeedHex") {
        privateKey = PrivateKey.fromHex(privateKeyData.key);
    } else {
        throw new Error("Invalid private key format");
    }

    let injectivedPassword: string | undefined =
        privateKeyData.injectivedPassword == null ? undefined : privateKeyData.injectivedPassword;

    return [privateKey, injectivedPassword];
}

// Use only null and not undefined so that it's always clear when output values are absent
const deployOutput = excess(t.type({
    minterCodeIdStored: t.union([t.number, t.null]),
    cw721CodeIdStored: t.union([t.number, t.null]),
    minterCodeIdInstantiated: t.union([t.number, t.null]),
    cw721CodeIdInstantiated: t.union([t.number, t.null]),
    minterCodeIdMigrated: t.union([t.number, t.null]),
    cw721CodeIdMigrated: t.union([t.number, t.null]),
    minterAddress: t.union([t.string, t.null]),
    cw721Address: t.union([t.string, t.null]),
    txJsonPath: t.union([t.string, t.null]),
}, "DeployOutput"));

type DeployOutput = t.TypeOf<typeof deployOutput>

function getMinterAddressForMigrate(context: DeployContext) {

        if (context.spec.minterAddressForMigration == null) {
            throw new ScriptError("If migrating must specify a minter address for migration with minterAddressForMigration option")
        }

        return context.spec.minterAddressForMigration
}

function getCw721AddressForMigrate(context: DeployContext) {

        if (context.spec.cw721AddressForMigration == null) {
            throw new ScriptError("If migrating must specify a cw721 address for migration with cw721AddressForMigration option")
        }

        return context.spec.cw721AddressForMigration

}

async function migrate(context: DeployContext) {
    if (context.spec.optionsMigrateMinter) {

        const minterCodeId = getMinterCodeIdForInstantiateOrMigrate(context);
        const migrateMinterMsg: DegaMinterMigrateMsg = {
            is_dev: true,
            dev_version: "dev-1" // Todo, replace with deployment logic
        };
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

        const migrateCw721Msg: DegaCw721MigrateMsg = {
            is_dev: true,
            dev_version: "dev-1" // Todo, replace with deployment logic
        };
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

    if (context.spec.optionsStoreCodeForMinter && context.spec.optionsGovernanceProposalForMinter) {
        throw new ScriptError("Will not store code and generate governance proposal tx in the same deployment")
    }

    if (context.spec.optionsStoreCodeForMinter) {

        let wasmPath;

        if (context.spec.preExistingMinterBinary != null) {
            wasmPath = path.join(pathsDeploy, context.spec.preExistingMinterBinary);
        } else {
            wasmPath = path.join(pathsDeployArtifacts, "dega_minter.wasm");
        }

        await storeWasm(context, "dega-minter", wasmPath)
    }

    if (context.spec.optionsGovernanceProposalForMinter) {
        if (context.spec.govProposalSpecForMinter == null) {
            throw new ScriptError("Must specify a governance proposal spec via govProposalSpecForMinter " +
                " to use the optionsGovernanceProposalForMinter option")
        }

        if (context.spec.preExistingMinterBinary == null) {
            throw new ScriptError("Must specify a pre-existing minter binary to use the optionsGovernanceProposalForMinter option")
        }

        if (context.spec.preExistingMinterBinaryChecksum == null) {
            throw new ScriptError("Must specify a pre-existing minter binary to use the optionsGovernanceProposalForMinter option")
        }

        const wasmPath = path.join(pathsDeploy, context.spec.preExistingMinterBinary);

        await governanceProposal(
            context,
            "dega-minter",
            wasmPath,
            context.spec.preExistingMinterBinaryChecksum,
            context.spec.govProposalSpecForMinter
        );
    }

    if (context.spec.optionsStoreCodeForCw721 && context.spec.optionsGovernanceProposalForCw721) {
        throw new ScriptError("Will not store code and generate governance proposal tx in the same deployment")
    }

    if (context.spec.optionsStoreCodeForCw721) {
        let wasmPath;

        if (context.spec.preExistingCw721Binary != null) {
            wasmPath = path.join(pathsDeploy, context.spec.preExistingCw721Binary);
        } else {
            wasmPath = path.join(pathsDeployArtifacts, "dega_cw721.wasm");
        }

        await storeWasm(context, "dega-cw721", wasmPath)
    }

    if (context.spec.optionsGovernanceProposalForCw721) {
        if (context.spec.govProposalSpecForCw721 == null) {
            throw new ScriptError("Must specify a governance proposal spec via govProposalSpecForCw721 " +
                "to use the optionGovernanceProposalForCw721 option")
        }

        if (context.spec.preExistingCw721Binary == null) {
            throw new ScriptError("Must specify a pre-existing cw721 binary to use the optionsGovernanceProposalForMinter option")
        }

        if (context.spec.preExistingCw721BinaryChecksum == null) {
            throw new ScriptError("Must specify a pre-existing cw721 binary to use the optionsGovernanceProposalForMinter option")
        }

        const wasmPath = path.join(pathsDeploy, context.spec.preExistingCw721Binary);

        await governanceProposal(
            context,
            "dega-cw721",
            wasmPath,
            context.spec.preExistingCw721BinaryChecksum,
            context.spec.govProposalSpecForCw721
        );
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
    if (fs.existsSync(pathsWorkspaceArtifacts) && fs.readdirSync(pathsWorkspaceArtifacts).length !== 0) {
        await run(context, "rm", [`${pathsWorkspaceArtifacts}/*`])
    }

    // Run the production optimize tool from cosm-wasm
    await run(context, "cargo", ["make", "build"])

    // Delete any binaries that may be left over from the last deployment attempt
    if (fs.existsSync(pathsDeployArtifacts)) {
        await run(context, "rm", [`-f`, `${pathsDeployArtifacts}/*.wasm`])

        const checksumsPath = path.join(pathsDeployArtifacts, "checksums.txt")
        if (fs.existsSync(checksumsPath)) {
            fs.rmSync(`${pathsDeployArtifacts}/checksums.txt`)
        }
    }

    // Move the optimized binaries to a distinct artifacts directory for deployments
    await run(context, "cp", [`${pathsWorkspaceArtifactsOptimized}/*`, `${pathsDeployArtifacts}`])
}


async function storeWasm(
    context: DeployContext,
    contractName: string,
    wasmPath: string,
) {

    if (context.deployTxPrivateKey == null || context.deployTxBroadcaster == null || context.deployTxAddress == null) {
        throw new ScriptError("Must specify a broadcast key to store code");
    }

    const wasmBytes = new Uint8Array(Array.from(fs.readFileSync(wasmPath)))

    const storeCodeMsg = MsgStoreCode.fromJSON({
        sender: context.deployTxAddress,
        wasmBytes: wasmBytes
    })

    console.log("Storing code for: " + contractName)
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
                        if (contractName == "dega-minter") {
                            context.output.minterCodeIdStored = parseInt(stripQuotes(value))
                        } else if (contractName == "dega-cw721") {
                            context.output.cw721CodeIdStored = parseInt(stripQuotes(value))
                        }
                    }
                })
            }

        })
        console.log("")
    }
}

export function replaceLineEndingsWithBreaks(input: string): string {
    // Replace Windows-style line endings
    let result = input.replace(/\r\n/g, '<br>\r\n');

    // Replace Unix-style line endings
    result = result.replace(/\n/g, '<br>\n');

    return result;
}

export function replaceLineEndingsWithSlashN(input: string): string {
    // Replace Windows-style line endings
    let result = input.replace(/\r\n/g, '\n');

    // Replace Unix-style line endings
    result = result.replace(/\n/g, '\n');

    return result;
}

function escapeGtLtWithUnicode(input: string): string {
    let result = input.replace(/</g, '\u003c');
    result = result.replace(/>/g, '\u003e');
    return result;
}

function escapeDoubleQuotes(input: string): string {
    return input.replace(/"/g, '\\"');
}

async function governanceProposal(
    context: DeployContext,
    contractName: string,
    wasmPath: string,
    wasmChecksum: string,
    govProposalSpec: GovProposalSpec
) {

    // if (context.injectivedPassword == null) {
    //     throw new ScriptError("Must specify injectived password to submit governance proposals")
    // }

    console.log("Creating governance proposal transaction for: " + contractName)

    if (wasmChecksum) {
        console.log("Specified Checksum for " + contractName + ": " + wasmChecksum)
        const wasmContents = fs.readFileSync(wasmPath);
        const generatedChecksum = Buffer.from(sha256(wasmContents));
        const generatedChecksumString = generatedChecksum.toString('hex');
        console.log("Generated Checksum for " + contractName + ": " + generatedChecksumString)
        if (generatedChecksumString != wasmChecksum) {
            throw new ScriptError("Wasm checksum does not match for: " + contractName)
        }
    }

    //const gasPrices = context.gasPricesAmountWei.toFixed();
    //const gas = new BigNumberInWei(60000000).toFixed();
    const despositAmountInBaseInj = govProposalSpec.depositAmountINJ;
    const despositAmountInWei = new BigNumberInBase(despositAmountInBaseInj).toWei().toFixed();

    let instantiateArgs;

    if (govProposalSpec.instantiateAddresses == null || govProposalSpec.instantiateAddresses.length == 0) {
        instantiateArgs = [`--instantiate-everybody`,`true`];
    } else {
        instantiateArgs = [
            `--instantiate-anyof-addresses`,
            `"` + govProposalSpec.instantiateAddresses.join(",") + `"`
        ];
    }

    const relativeSummaryFilePath = govProposalSpec.summaryFilePath;
    const summaryFilePath = path.join(pathsDeploy, relativeSummaryFilePath);
    const summaryFileName = path.basename(summaryFilePath);
    let summaryContents = fs.readFileSync(summaryFilePath, "utf-8");

    const htmlPreview =
        `<html>\n` +
        `<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />\n` +
        replaceLineEndingsWithBreaks(summaryContents) + `\n` +
        `</html>\n`;

    const htmlPreviewFileName = summaryFileName.replace(".txt", "_" + contractName + ".html")
    const htmlPreviewPath = path.resolve(pathsDeployArtifacts, htmlPreviewFileName);
    fs.writeFileSync(htmlPreviewPath, htmlPreview);


    console.log("Running governance proposal for: " + contractName)

    let baseTxArgs = [];
    baseTxArgs.push("injectived");
    baseTxArgs.push("tx");
    baseTxArgs.push("wasm");
    baseTxArgs.push("submit-proposal");
    baseTxArgs.push("wasm-store");
    baseTxArgs.push(`"${wasmPath}"`);
    baseTxArgs.push(`--title="${govProposalSpec.title}"`);
    baseTxArgs.push(`--summary="empty"`); // put an empty summary and replace later
    //baseTxArgs.push(`--summary="Example Summary"`);
    baseTxArgs.push(...instantiateArgs);
    baseTxArgs.push(`--deposit=${despositAmountInWei}inj`);
    baseTxArgs.push(`--chain-id="${context.chainId}"`);
    baseTxArgs.push(`--from=${govProposalSpec.proposerAddress}`);
    baseTxArgs.push(`--node=${context.node}`);
    baseTxArgs.push(`--generate-only`);
    baseTxArgs.push(`--gas-prices=500000000inj`);

    // Max out the gas instead of estimating, since the margin for going through can be small and the gas cost is often high
    baseTxArgs.push(`--gas=50000000`);
    //baseTxArgs.push(`--gas=auto`);
    //baseTxArgs.push(`--gas-adjustment=1.4`);


    console.log("Base CLI Tx:");
    console.log(baseTxArgs.join(" "));

    const injectivedPassword = process.env.INJECTIVED_PASSWORD;
    if (injectivedPassword == null) {
        throw new ScriptError("Must specify INJECTIVED_PASSWORD in environment to generate governance proposal transactions");
    }

    let fullTxArgs = [];
    fullTxArgs.push("echo");
    fullTxArgs.push(`${injectivedPassword}`);
    fullTxArgs.push(`|`);
    fullTxArgs = fullTxArgs.concat(baseTxArgs);


    //const txJsonStringUnformatted = await run(context, "injectived", generateTxArgs);
    const txJsonStringGenerated = execSync(fullTxArgs.join(" "), { encoding: 'utf-8' });
    console.log("Generated Tx:")
    console.log("================================================")
    logObjectFullDepth(txJsonStringGenerated);
    console.log("================================================")

    let txJsonObj: any = JSON.parse(txJsonStringGenerated) as any;

    // Replace line endings with \n
    summaryContents = replaceLineEndingsWithSlashN(summaryContents);

    txJsonObj.body.messages[0].summary = summaryContents;

    console.log("Summary String Contents:")
    console.log("================================================")
    //logObjectFullDepth(summaryContents);
    console.log(summaryContents)
    console.log("================================================")

    const noSuffixOutputJsonTxFilepath =
        path.join(pathsDeployArtifacts, "proposal-tx_" + contractName + "_" + context.spec.network.toString().toLowerCase());

    const formattedOutputJsonTxFilepath = noSuffixOutputJsonTxFilepath + ".json";
    fs.writeFileSync(formattedOutputJsonTxFilepath, JSON.stringify(txJsonObj, null, 2));

    console.log("Formatted Proposal Tx JSON File: " + formattedOutputJsonTxFilepath);

    context.output.txJsonPath = formattedOutputJsonTxFilepath;

    const summaryFilepath = noSuffixOutputJsonTxFilepath + "_summary.txt";
    fs.writeFileSync(summaryFilepath, summaryContents);
}


function getCw721CodeIdForInstantiateOrMigrate(context: DeployContext) {

    if (context.spec.optionsStoreCodeForCw721) {
        if (context.output.cw721CodeIdStored == null) {
            throw new ScriptError("Missing cw721 code_id after storing")
        }

        return context.output.cw721CodeIdStored;

    } else if (context.spec.preExistingCw721CodeId == null) {
        throw new ScriptError("Must specify a pre-existing cw721 code_id if not storing cw721 code")
    } else {
        return context.spec.preExistingCw721CodeId;
    }
}

function getMinterCodeIdForInstantiateOrMigrate(context: DeployContext) {

    if (context.spec.optionsStoreCodeForMinter) {
        if (context.output.minterCodeIdStored == null) {
            throw new ScriptError("Missing minter code_id after storing")
        }

        return context.output.minterCodeIdStored;

    } else if (context.spec.preExistingMinterCodeId == null) {
        throw new ScriptError("Must specify a pre-existing minter code_id if not storing minter code")
    } else {
        return context.spec.preExistingMinterCodeId;
    }
}


async function broadcastInstantiate(context: DeployContext, minterMigrateAdmin: string, minterCodeId: number, instantiateMinterMsg: DegaMinterInstantiateMsg, cw721CodeId: number) {

    if (context.deployTxPrivateKey == null || context.deployTxBroadcaster == null || context.deployTxAddress == null) {
        throw new ScriptError("Must specify a deployment private key via 'privateKeyFileName' to broadcast instantiate");
    }

    console.log("Broadcasting instantiation for Dega Minter and Collection")
    console.log("")

    if (context.spec.deployAddress && context.spec.deployAddress != context.deployTxAddress) {
        throw new ScriptError("Deploy address in the spec does not match the private key address in the spec");
    }

    const instantiateContractMsg = MsgInstantiateContract.fromJSON({
        sender: context.deployTxAddress,
        admin: minterMigrateAdmin,
        codeId: minterCodeId,
        label: context.spec.minterContractLabel,
        msg: instantiateMinterMsg,
    })

    console.log("Broadcasting instantiation for Dega Minter and Collection")
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

async function generateInstantiate(context: DeployContext, minterMigrateAdmin: string, minterCodeId: number, instantiateMinterMsg: DegaMinterInstantiateMsg) {

    console.log("Generating instantiation transaction for DEGA Minter and Collection")
    console.log("")

    if (context.spec.deployAddress == null) {
        throw new ScriptError("Must specify deployAddress to generate an instantiate transaction");
    }

    if (context.spec.privateKeyFilename) {
        throw new ScriptError("For safety, must not specify a private key file when generating transactions, this transaction will use" +
            "the address in the 'deployAddress' field as the sender");
    }

    //const instantiateMsgBuffer = new Buffer(toBase64(instantiateMinterMsg), "base64");

    let baseTxArgs = [];
    baseTxArgs.push("injectived");
    baseTxArgs.push("tx");
    baseTxArgs.push("wasm");
    baseTxArgs.push("instantiate");
    baseTxArgs.push(`${minterCodeId}`);

    baseTxArgs.push(`'` + JSON.stringify(instantiateMinterMsg, null, 0) + `'`);

    baseTxArgs.push(`--label="${context.spec.minterContractLabel}"`);

    if (minterMigrateAdmin != null) {
        baseTxArgs.push(`--admin="${minterMigrateAdmin}"`);
    }
    baseTxArgs.push(`--chain-id="${context.chainId}"`);
    baseTxArgs.push(`--from=${context.spec.deployAddress}`);
    baseTxArgs.push(`--node=${context.node}`);
    baseTxArgs.push(`--generate-only`);
    baseTxArgs.push(`--gas=auto`);
    baseTxArgs.push(`--gas-adjustment=1.4`);
    baseTxArgs.push(`--gas-prices=500000000inj`);

    console.log("Base CLI Tx:");
    console.log(baseTxArgs.join(" "));

    const injectivedPassword = process.env.INJECTIVED_PASSWORD;
    if (injectivedPassword == null) {
        throw new ScriptError("Must specify INJECTIVED_PASSWORD in environment to generate transactions");
    }

    let fullTxArgs = [];
    fullTxArgs.push("echo");
    fullTxArgs.push(`${injectivedPassword}`);
    fullTxArgs.push(`|`);
    fullTxArgs = fullTxArgs.concat(baseTxArgs);

    //const txJsonStringUnformatted = await run(context, "injectived", generateTxArgs);
    const txJsonStringGenerated = execSync(fullTxArgs.join(" "), { encoding: 'utf-8' });
    console.log("Generated Tx:");
    console.log("================================================");
    logObjectFullDepth(txJsonStringGenerated);
    console.log("================================================");

    let txJsonObj: any = JSON.parse(txJsonStringGenerated) as any;

    //txJsonObj.body.messages[0].summary = summaryContents;

    const noSuffixOutputJsonTxFilepath =
        path.join(pathsDeployArtifacts, "instantiate-tx_" + context.spec.network.toString().toLowerCase());

    console.log("Formatted Instantiate Tx JSON File: " + noSuffixOutputJsonTxFilepath);
    context.output.txJsonPath = noSuffixOutputJsonTxFilepath;

    const formattedOutputJsonTxFilepath = noSuffixOutputJsonTxFilepath + ".json";
    fs.writeFileSync(formattedOutputJsonTxFilepath, JSON.stringify(txJsonObj, null, 2));
}


async function instantiate(context: DeployContext) {

    const minterCodeId = getMinterCodeIdForInstantiateOrMigrate(context);
    const cw721CodeId = getCw721CodeIdForInstantiateOrMigrate(context);

    let cw721MigrateAdmin: string | null | undefined = null;

    if (context.spec.cw721ContractMigratable) {

        cw721MigrateAdmin = context.spec.cw721MigrateAdmin;

        if (cw721MigrateAdmin == null) {
            throw new ScriptError("Must specify a cw721 migrate admin to make cw721 contract migratable")
        }
    } else if (context.spec.cw721MigrateAdmin != undefined) {
        throw new ScriptError("Specified cw721 migrate admin when cw721 contract is not migratable")
    }

    let royalty_settings = null;

    if (context.spec.collectionSecondaryRoyaltyPaymentAddress != undefined &&
        context.spec.collectionSecondaryRoyaltyShare != undefined) {
        royalty_settings = {
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
                description: context.spec.collectionDescription,
                image: context.spec.collectionImageURL,
                external_link: context.spec.collectionExternalLinkURL,
                royalty_settings: royalty_settings,
            },

        },
        minter_params: {
            dega_minter_settings: {
                signer_pub_key: context.spec.minterSignerPubKeyBase64,
                minting_paused: context.spec.minterMintingPaused,
            },
            initial_admin: context.spec.minterInitialAdmin,
        },
        cw721_contract_label: context.spec.cw721ContractLabel,
        cw721_contract_admin: cw721MigrateAdmin,
    }


    console.log("InstantiateMsg : ")
    console.log(instantiateMinterMsg)
    console.log("")

    let minterMigrateAdmin: string = "";

    if (context.spec.minterContractMigratable) {

        if (context.spec.minterMigrateAdmin == null) {
            throw new ScriptError("Must specify a minter migrate admin to make minter contract migratable")
        } else {
            minterMigrateAdmin = context.spec.minterMigrateAdmin;
        }
    } else if (context.spec.minterMigrateAdmin != undefined) {
        throw new ScriptError("Specified minter migrate admin when minter contract is not migratable")
    }

    if (context.spec.optionsBroadcast) {
        await broadcastInstantiate(context, minterMigrateAdmin, minterCodeId, instantiateMinterMsg, cw721CodeId);
    } else {
        await generateInstantiate(context, minterMigrateAdmin, minterCodeId, instantiateMinterMsg);
    }
}


async function migrateContract(
    context: DeployContext,
    codeId: number,
    migrateMessage: object,
    contractAddress: string,
    contractName: string,
) {

    if (context.deployTxPrivateKey == null || context.deployTxBroadcaster == null || context.deployTxAddress == null) {
        throw new ScriptError("Must specify a broadcast key to migrate");
    }

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

// async function dryRunUsefulCodeSnippets() {
//
//     txArgs.push(`--gas=auto`);
//     txArgs.push(`--gas-adjustment=1.5`);
//     txArgs.push(`--offline`);
//
//     For broadcast
//     txArgs.push(`--broadcast-mode=sync`);
//     txArgs.push(`--node=${context.deployTxBroadcaster.endpoints.rpc}`);
//     txArgs.push(`--gas=${gas}`);
//     txArgs.push(`--gas-prices=${gasPrices}inj`);
//     txArgs.push(`--yes`);
//     txArgs.push(`--output`);
//     txArgs.push(`json`);
//     if (govProposalSpec.dryRun) {
//         txArgs.push(`--dry-run`);
//     }
//
//     let dryRunEstimateTxArgs = txArgs;
//     dryRunEstimateTxArgs.push(`--dry-run`);
//     dryRunEstimateTxArgs.push(`2>&1`); // Needed because by default gas estimate output is sent to stderr
//     const gasEstimateOutput = execSync(dryRunEstimateTxArgs.join(" "), { encoding: 'utf-8' });
//     const gasEstimateOutputTokens = gasEstimateOutput.split(" ");
//     const gasEstimateString = gasEstimateOutputTokens[gasEstimateOutputTokens.length - 1];
//     const gasEstimateNumber = parseInt(gasEstimateString);
//     console.log("Submit Proposal Gas Estimate: " + gasEstimateNumber);
//     const adjustedGasEstimate = Math.round(gasEstimateNumber * 1.3);
//     console.log("Adjusted Gas Estimate: " + adjustedGasEstimate);
//
// }


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

    let outResult = ""

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
        outResult += data
    });

    childProcess.stderr.on('data', (data) => {
        process.stderr.write(data);
        fs.appendFileSync(pathsLogFile, data);
        outResult += data
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

    return outResult;
}


interface TxEvent {
    type: string,
    attributes: TxAttribute[],
}

interface TxAttribute {
    key: Uint8Array,
    value: Uint8Array,
}

if (require.main === module) {
    main()
}