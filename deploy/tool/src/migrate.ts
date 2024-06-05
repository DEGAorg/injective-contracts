import {DegaMinterMigrateMsg} from "./messages/dega_minter_migrate";
import {DegaCw721MigrateMsg} from "./messages/dega_cw721_migrate";
import excess from "io-ts-excess";
import * as t from "io-ts";
import {
    createTxContext,
    TxContext,
    generateTxJsonObj,
    writeTxJsonOutput
} from "./transaction";

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

interface MigrateOutput {
    txJsonPath: string;
}

type MigrateSpec = t.TypeOf<typeof migrateSpecDef>;
interface MigrateContext extends TxContext<MigrateSpec,MigrateOutput> {}

type MigrateMessage = DegaMinterMigrateMsg | DegaCw721MigrateMsg;

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

export async function migrate(specPath: string, remainingArgs: string[]) {

    console.log("Creating migration transaction...");
    console.log("");

    const output: MigrateOutput = {
        txJsonPath: ""
    };
    let context: MigrateContext = createTxContext(specPath, migrateSpecDef, output, "migrate");

    const migrateMsg: MigrateMessage = getMigrateMsgForVariant(context);

    console.log(`Contract variant: ${context.spec.contractVariant}`);
    console.log("");

    let txArgs: string[] = [];
    txArgs.push("wasm");
    txArgs.push("migrate");
    txArgs.push(context.spec.contractAddressForMigration);
    txArgs.push(context.spec.codeId.toString());
    txArgs.push(JSON.stringify(migrateMsg));

    const migrateTxJson = await generateTxJsonObj(context, txArgs);
    writeTxJsonOutput(context, migrateTxJson);
}

