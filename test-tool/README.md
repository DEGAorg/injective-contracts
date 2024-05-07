# DEGA Injective Smart Contract Typescript Test Tool

## Overview

This directory contains the typescript test tool, a set of simple calls and functionality that can be used
to quickly test, prototype and debug the smart contracts using a web calling paradigm and API.

## Setup



## Calling

The test tool can either be called:
- Through the CLI by calling `dega-inj test <command> <args>` from the test-tool directory
- Through an NPM script by calling `npm run test <command> <args>` from the test-tool directory
- Directly through node by calling `node dist/test.js <command> <args>` from the test-tool directory

## Important commands

- `dega-inj test generate` - Generates the typescript messages from the rust messages
- `dega-inj test sig-info` - Get the signature information for the provided signature mnemonic.
Critically the "compressed pubkey (base64)" line is what is needed for the signer pubkey variable
of the minter contract.
- `dega-inj test q <call>` - Call one of the query commands / tests from query.ts
- `dega-inj test tx <call>` - Call one of the transaction commands / tests from tx.ts
- `dega-inj test tx store` (or "tx s") - Store the codes for the minter and collection contracts
- `dega-inj test tx instantiate` (or "tx i") - Instantiate the minter and collection contracts
- `dega-inj test tx mint` - Do a mint call to the minter contract with signature verification

## Typescript Message Class Generation

The `dega-inj test generate` contains functionality that looks at the JSON schema files inside of the schema
directory of the DEGA minter and CW721 collection contracts, and generates typescript classes that allow for
easier validated calls to the message classes.

See the root README file for background on this.

These typescript classes are built to a "generated-ts" subdirectory inside of this test-tool directory. This is
so that you don't automatically break the tool when you build, since the changes may stop the tool from working.

Once compiled, these classes can be deployed into the tool itself, placed into the deployment tool, or grabbed for an
outside project.