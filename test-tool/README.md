# DEGA Injective Smart Contract Typescript Test Tool

## Overview

This `./test-tool` directory contains the typescript test tool, a set of simple calls and functionality that can be used
to quickly test, prototype and debug the smart contracts using a web calling paradigm and API.

## Setup

When you performed the workspace setup in the [Workspace README.md](../README.md), you will have already set up the 
test tool to be used.

In order for it to be useful, you need to specify a set of code ID's and contract addresses in the `.env` file
at the root of the test-tool directory, for the environment you are interested in.

The workspace README.md file contains instructions for setting up a set of contracts on your local network.

As an example of doing this on different networks, in order to use the test tool on the Injective Testnet with contracts
you have uploaded:

1. Build the contracts you want to upload with `cargo make build`
2. In your test-tool's .env file set `NETWORK=Testnet` to use the test-tool on Testnet
3. Now on testnet, run `dega-inj-test tx store` to store the minter and collection contracts. Make note of the code-id's
you get back.
4. Add the code-id's to your .env file:
```bash
MINTER_CODE_ID_TESTNET=<minter_code_id>
CW721_CODE_ID_TESTNET=<cw721_code_id>
```
5. Now run `dega-inj-test tx instantiate` to instantiate the minter and collection contracts. Make note of the addresses.
6. Add the addresses to your .env file:
```bash
MINTER_ADDRESS_TESTNET=<minter_address>
CW721_ADDRESS_TESTNET=<cw721_address>
```

Alternatively, if you want to interact with a set of common test contracts someone else has deployed on Testnet,
use the same fields as above, but with the address, and if needed code-id's, from the other person's deployment.

You can also interact with Mainnet contracts or codes by setting `NETWORK=Mainnet` in the .env file, and using:
```bash
MINTER_CODE_ID_MAINNET=<minter_code_id>
CW721_CODE_ID_MAINNET=<cw721_code_id>
MINTER_ADDRESS_MAINNET=<minter_address>
CW721_ADDRESS_MAINNET=<cw721_address>
```

Note, on Mainnet code-id's can only be stored via governance, so if you want to create your own contracts you will
need to use the code id's a previous release that have already been uploaded through a governance proposal.

Also of-course to test on Mainnet you will need to use real money (INJ tokens) for gas.

## Calling

The test tool can either be called:
1. Through the CLI by calling `dega-inj-test <command> <args>` from any directory. Note that if you
are making changes to the test tool, this command will not receive the changes until you re-build the tool by running
`npx tsc` in the test-tool directory.
2. Through an NPM script by calling `npm run test <command> <args>` from the test-tool directory
3. Directly through node by calling `node dist/test.js <command> <args>` from the test-tool directory

## Important commands

- `dega-inj-test generate` - Generates the typescript messages from the rust messages
- `dega-inj-test sig-info` - Get the signature information for the provided signature mnemonic.
Critically the "compressed pubkey (base64)" line is what is needed for the signer pubkey variable
of the minter contract.
- `dega-inj-test query <call>` - Call one of the query commands / tests from query.ts
- `dega-inj-test tx <call>` - Call one of the transaction commands / tests from tx.ts
- `dega-inj-test tx store` (or "tx s") - Store the codes for the minter and collection contracts
- `dega-inj-test tx instantiate` (or "tx i") - Instantiate the minter and collection contracts
- `dega-inj-test tx mint-combined` - Do a mint call to the minter contract with signature verification.
`dega-inj-test tx mint-as-backend` and `dega-inj-test tx mint-as-user` for minting in the same fashion as the web backend and submitting
the transaction in the same fashion as a user.

## Typescript Message Class Generation

The `dega-inj test generate` contains functionality that looks at the JSON schema files inside of the schema
directory of the DEGA minter and CW721 collection contracts, and generates typescript classes that allow for
easier validated calls to the message classes.

See the root README file for background on this.

These typescript classes are built to a "generated-ts" subdirectory inside of this test-tool directory. This is
so that you don't automatically break the tool when you build, since the changes may stop the tool from working.

Once compiled, these classes can be deployed into the tool itself, placed into the deployment tool, or grabbed for an
outside project.