import {FetchingJSONSchemaStore, InputData, IssueAnnotationData, JSONSchemaInput, quicktype} from "quicktype-core";
import fs from "fs";
import path from "node:path";

async function compileFile(
    schemaFilePath: string,
    outputTsFilePath: string,
    typeName: string,
) {
    const schemaInput = new JSONSchemaInput(new FetchingJSONSchemaStore());

    await schemaInput.addSource({
        name: typeName,
        schema: fs.readFileSync(path.resolve(__dirname, schemaFilePath), 'utf8')
    });

    const inputData = new InputData();
    inputData.addInput(schemaInput);

    const compileResults =
        await quicktype({
            inputData,
            lang: "typescript"
        });

    let hadError = false;
    for (const sa of compileResults.annotations) {
        const annotation = sa.annotation;
        if (!(annotation instanceof IssueAnnotationData)) continue;
        const lineNumber = sa.span.start.line;
        const humanLineNumber = lineNumber + 1;
        console.error(`\nIssue in line ${humanLineNumber}: ${annotation.message}`);
        console.error(`${humanLineNumber}: ${compileResults.lines[lineNumber]}`);
        hadError = true;
    }

    if (hadError) {
        throw new Error("Error in quicktype");
    } else {
        fs.writeFileSync(path.resolve(__dirname, outputTsFilePath), compileResults.lines.join("\n"));
    }

    inputData.addInput(schemaInput);
}

export async function generate(args: string[]) {

    const generatedDir = path.resolve(__dirname, "../generated-ts");
    console.log("generated: " + generatedDir)
    if (!fs.existsSync(generatedDir)) {
        fs.mkdirSync(generatedDir);
    }
    const messagesDir = path.resolve(generatedDir, "messages");
    if (!fs.existsSync(messagesDir)) {
        fs.mkdirSync(messagesDir);
    }

    // Dega Minter Messages to Typescript
    await compileFile(
        "../../contracts/dega-minter/schema/instantiate_msg.json",
        "../generated-ts/messages/dega_minter_instantiate.ts",
        "DegaMinterInstantiateMsg",
    );

    await compileFile(
        "../../contracts/dega-minter/schema/migrate_msg.json",
        "../generated-ts/messages/dega_minter_migrate.ts",
        "DegaMinterMigrateMsg",
    );

    await compileFile(
        "../../contracts/dega-minter/schema/execute_msg.json",
        "../generated-ts/messages/dega_minter_execute.ts",
        "DegaMinterExecuteMsg",
    );

    await compileFile(
        "../../contracts/dega-minter/schema/query_msg.json",
        "../generated-ts/messages/dega_minter_query.ts",
        "DegaMinterQueryMsg",
    );

    await compileFile(
        "../../contracts/dega-minter/schema/query_response_messages.json",
        "../generated-ts/messages/dega_minter_query_responses.ts",
        "DegaMinterQueryResponseMessages",
    );


    // Dega CW721 Messages to Typescript
    await compileFile(
        "../../contracts/dega-cw721/schema/instantiate_msg.json",
        "../generated-ts/messages/dega_cw721_instantiate.ts",
        "DegaCw721InstantiateMsg",
    );

    await compileFile(
        "../../contracts/dega-cw721/schema/migrate_msg.json",
        "../generated-ts/messages/dega_cw721_migrate.ts",
        "DegaCw721MigrateMsg",
    );

    await compileFile(
        "../../contracts/dega-cw721/schema/execute_msg.json",
        "../generated-ts/messages/dega_cw721_execute.ts",
        "DegaCw721ExecuteMsg",
    );

    await compileFile(
        "../../contracts/dega-cw721/schema/query_msg.json",
        "../generated-ts/messages/dega_cw721_query.ts",
        "DegaCw721QueryMsg",
    );

    await compileFile(
        "../../contracts/dega-cw721/schema/query_response_messages.json",
        "../generated-ts/messages/dega_cw721_query_responses.ts",
        "DegaCw721QueryResponseMessages",
    );
}