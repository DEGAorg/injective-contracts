import {DegaMinterMigrateMsg} from "./messages/dega_minter_migrate";
import {DegaCw721MigrateMsg} from "./messages/dega_cw721_migrate";
import excess from "io-ts-excess";
import * as t from "io-ts";
import {
    createTxContext,
    TxContext,
    writeTxJsonOutput
} from "./transaction";
import {generateTxJsonObj} from "./generate";
import {DeployError} from "./error";
import {CommandInfo} from "./main";
import {makeSpecHelp} from "./help";
import {instantiate} from "./instantiate";

const migrateSpecDef = excess(t.type({
    network: t.keyof({
        Local: null,
        Testnet: null,
        Mainnet: null
    }),
    node: t.union([t.string, t.undefined, t.null]),
    contractVariant: t.keyof({
        Minter: null,
        Collection: null,
    }),
    deployAddress: t.string,
    codeId: t.number,
    contractAddressForMigration: t.string,
    note: t.union([t.string, t.undefined, t.null]),
}, "MigrateSpec"));


type MigrateSpec = t.TypeOf<typeof migrateSpecDef>;
interface MigrateContext extends TxContext<MigrateSpec> {}

type MigrateMessage = DegaMinterMigrateMsg | DegaCw721MigrateMsg;


const migrateCommand: CommandInfo = {
    name: "migrate",
    summary: "Create a migration transaction for a single deployed smart contract.",
    additionalUsage: "",
    run: migrate,
    specHelp: makeSpecHelp(migrateSpecDef),
}

export function getMigrateCommand(): CommandInfo {
    return migrateCommand;
}


export async function migrate(specPath: string, remainingArgs: string[]) {

    console.log("Creating migration transaction...");
    console.log("");

    if (remainingArgs.length) {
        throw new DeployError("InputError", `Extra arguments`);
    }

    let context: MigrateContext = createTxContext(specPath, migrateSpecDef, "migrate");

    const migrateMsg: MigrateMessage = getMigrateMsgForVariant(context);

    console.log(`Contract variant: ${context.spec.contractVariant}`);
    console.log("");

    let txArgs: string[] = [];
    txArgs.push("wasm");
    txArgs.push("migrate");
    txArgs.push(context.spec.contractAddressForMigration);
    txArgs.push(context.spec.codeId.toString());
    txArgs.push(`'${JSON.stringify(migrateMsg)}'`);

    const migrateTxJson = await generateTxJsonObj(context, txArgs);
    writeTxJsonOutput(context, migrateTxJson);
}



function getMigrateMsgForVariant(context: MigrateContext): MigrateMessage {
    switch (context.spec.contractVariant) {
        case "Minter":
            const minterMsg: DegaMinterMigrateMsg = {
                is_dev: true,
                dev_version: "dev-1",
            }
            return minterMsg;
        case "Collection":
            const collectionMsg: DegaCw721MigrateMsg = {
                is_dev: true,
                dev_version: "dev-1"
            };
            return collectionMsg;
        default:
            throw new Error("Unknown contract variant");
    }
}