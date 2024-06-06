import {execSync} from "child_process";
import {InjectiveTx, TxContext, TxOutput, TxSpec} from "./transaction";
import {DeploySpec, logObjectFullDepth} from "./context";
import {DeployError} from "./error";

export interface GenerateSpec extends TxSpec {

    deployAddress: string;
}

export async function generateTxJsonObj<
    T,
    S extends GenerateSpec,
    O extends TxOutput,
>(context: TxContext<S, O>, txArgs: string[]): Promise<InjectiveTx<T>> {

    console.log("Generating transaction");
    console.log("");

    let baseTxArgs = [];
    baseTxArgs.push("injectived");
    baseTxArgs.push("tx");

    baseTxArgs = baseTxArgs.concat(txArgs);

    baseTxArgs.push(`--chain-id="${context.chainId}"`);
    baseTxArgs.push(`--from=${context.spec.deployAddress}`);
    baseTxArgs.push(`--node=${context.node}`);
    baseTxArgs.push(`--generate-only`);

    if (context.gas === "auto") {
        baseTxArgs.push(`--gas=auto`);
        baseTxArgs.push(`--gas-adjustment=1.4`);
    } else {
        baseTxArgs.push(`--gas=${context.gas.toString()}`);
    }

    baseTxArgs.push(`--gas-prices=500000000inj`);

    console.log("Base CLI Tx:");
    console.log(baseTxArgs.join(" "));
    console.log("");

    const injectivedPassword = process.env.INJECTIVED_PASSWORD;
    if (injectivedPassword == null) {
        throw new DeployError("InputError", "Must specify INJECTIVED_PASSWORD in environment to generate transactions");
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

    return JSON.parse(txJsonStringGenerated) as InjectiveTx<T>;
}