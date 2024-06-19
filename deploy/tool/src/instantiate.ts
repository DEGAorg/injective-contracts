import excess from "io-ts-excess";
import * as t from "io-ts";
import {createTxContext, TxContext, writeTxJsonOutput} from "./transaction";
import {DegaMinterInstantiateMsg} from "./messages";
import {generateTxJsonObj} from "./generate";
import {DeployError} from "./error";
import {CommandInfo} from "./main";
import {makeSpecHelp} from "./help";
import {govProp} from "./gov-prop";


const instantiateSpecDef = excess(t.type({
    network: t.keyof({
        Local: null,
        Testnet: null,
        Mainnet: null
    }),
    node: t.union([t.string, t.undefined, t.null]),
    deployAddress: t.string,
    minterCodeId: t.number,
    minterMigratable: t.boolean,
    minterMigrateAdmin: t.union([t.string, t.undefined, t.null]),
    minterSignerPubKeyBase64: t.string,
    minterMintingPaused: t.boolean,
    minterInitialAdmin: t.string,
    minterContractLabel: t.string,
    collectionCodeId: t.number,
    collectionMigratable: t.boolean,
    collectionMigrateAdmin: t.union([t.string, t.undefined, t.null]),
    collectionContractLabel: t.string,
    collectionName: t.string,
    collectionSymbol: t.string,
    collectionDescription: t.string,
    collectionImageURL: t.string,
    collectionExternalLinkURL: t.string,
    collectionSecondaryRoyaltyPaymentAddress: t.union([t.string, t.undefined, t.null]),
    collectionSecondaryRoyaltyShare: t.union([t.string, t.undefined, t.null]),
    note: t.union([t.string, t.undefined, t.null]),
}, "InstantiateSpec"));


type InstantiateSpec = t.TypeOf<typeof instantiateSpecDef>;
interface InstantiateContext extends TxContext<InstantiateSpec> {}

const instantiateCommand: CommandInfo = {
    name: "instantiate",
    summary: "Create an instantiation transaction to deploy both the minter and collection contracts simultaneously.",
    additionalUsage: "",
    run: instantiate,
    specHelp: makeSpecHelp(instantiateSpecDef),
}

export function getInstantiateCommand(): CommandInfo {
    return instantiateCommand;
}

export async function instantiate(specPath: string, remainingArgs: string[]) {

    console.log("Creating instantiation transaction...");
    console.log("");

    if (remainingArgs.length) {
        throw new DeployError("UsageError", `Extra arguments`);
    }

    let context: InstantiateContext = createTxContext(specPath, instantiateSpecDef, "instantiate");

    if (context.spec.collectionMigratable) {

        if (!context.spec.collectionMigrateAdmin) {
            throw new DeployError("InputError", "Must specify a cw721 migrate admin to make cw721 contract migratable")
        }
    } else if (context.spec.collectionMigrateAdmin) {
        throw new DeployError("InputError", "Specified cw721 migrate admin when cw721 contract is not migratable")
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
            code_id: context.spec.collectionCodeId,
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
        cw721_contract_label: context.spec.collectionContractLabel,
        cw721_contract_admin: context.spec.collectionMigrateAdmin,
    }

    console.log("InstantiateMsg : ")
    console.log(instantiateMinterMsg)
    console.log("")

    if (context.spec.minterMigratable) {
        if (!context.spec.minterMigrateAdmin) {
            throw new DeployError("InputError","Must specify a minter migrate admin to make minter contract migratable")
        }
    } else if (context.spec.minterMigrateAdmin) {
        throw new DeployError("InputError","Specified minter migrate admin when minter contract is not migratable")
    }

    let txArgs = [];
    txArgs.push("wasm");
    txArgs.push("instantiate");
    txArgs.push(`${context.spec.minterCodeId.toString()}`);
    txArgs.push(`'` + JSON.stringify(instantiateMinterMsg, null, 0) + `'`);
    txArgs.push(`--label="${context.spec.minterContractLabel}"`);

    if (context.spec.minterMigrateAdmin) {
        txArgs.push(`--admin="${context.spec.minterMigrateAdmin}"`);
    }

    const instantiateTxJson = await generateTxJsonObj(context, txArgs);
    writeTxJsonOutput(context, instantiateTxJson);
}