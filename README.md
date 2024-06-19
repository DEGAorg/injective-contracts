# DEGA Injective Smart Contracts

This repository contains the smart contracts for the DEGA platform on Injective.

## Smart Contracts Location
- [dega-cw721](https://github.com/DEGAorg/injective-contracts/blob/main/contracts/dega-cw721/src/entry.rs)
- [dega-minter](https://github.com/DEGAorg/injective-contracts/blob/main/contracts/dega-minter/src/entry.rs)

## Workspace Setup

### Pre-requisite Requirements
- Node / NPM
  - Powers the test and deployment tools
- Docker
  - Needed to run the "cargo make build" command to build optimized contracts
- Linux (or WSL)
  - Needed for injectived and numerous bash commands within typescript

### Setup script
First run the following script in the workspace root to set up your workspace:
```bash
./setup.sh
```

### Setting up the Test Tool .env file

The test tool uses a .env file for a number of settings, in particular mnemonics, code ID's and contract addresses.

The setup script above created a default .env file at "./test-tool/.env".

Open that .env file and enter 24-word secret mnemonics into the following fields:

```bash
PRIVATE_KEY_MNEMONIC=<24-word mnemonic>
SIGNER_KEY_MNEMONIC=<24-word mnemonic>
```

### Setting up injectived locally

If you wish to test locally, or run integration tests, you will need to setup the injectived program.

The latest chain release for Injective can be found here: https://github.com/InjectiveLabs/injective-chain-releases/releases

If you look in the assets section of the latest release, you can download the linux-amd64 binaries for that release.

Follow the following instructions from the github page to install:
```bash
unzip <path-to>/linux-amd64.zip
sudo mv injectived peggo /usr/bin
sudo mv libwasmvm.x86_64.so /usr/lib
```

You should now have the "injectived" command.

To setup your local chain, now run:
```bash
wget https://raw.githubusercontent.com/InjectiveLabs/injective-chain-releases/master/scripts/setup.sh
chmod +x ./setup.sh # Make the script executable
./setup.sh
injectived init local-injective-node --chain-id=injective-1
```
Where "local-injective-node" will be the moniker of your local node.

The "LOCAL_GENESIS_MNEMONIC=" field in your .env file has been pre-filled by the workspace setup script with the mnemonic of "signer1"
from the injective setup script, which contains a large balance of 1.35M INJ on your local network.

See the setup.sh script you just downloaded for the mnemonics of the other local accounts if you need them.

The password added by the injective setup script for all the local users is "12345678".

Use the command `dega-inj-test tx refill-local` to refill addresses on your local testnet using the account specified in the "LOCAL_GENESIS_MNEMONIC" field.

Run `dega-inj-test help tx refill-local` for more information on how to run the refill-local command.

Whenever you want to start your local chain, open up a new terminal window and run:
```bash
injectived start
```

You will have to leave this terminal window open while you want to have your local chain running.

### Multiple Workspaces

If you are working with multiple workspaces, please note that the dega-inj-test and dega-inj-deploy commands will be
linked to whichever workspace has most recently run the command `npm install -g .` in the workspace roots (./deploy/tool and
./test-tool respectively).

The command `cargo make activate` has been added to help with this. Run `cargo make activate` in the workspace you wish to
use to point the dega-inj-test and dega-inj-deploy commands there.

In the future the commands could be adapted to run based on the workspace you are in.

Additionally, directly running the tools with `npm run run` or `node ./dist/index.js` from the respective tool root,
avoids this issue.

## Building

Once you have run the setup script from the Workspace Setup instructions above, you can build the smart contracts
with the following command:

```bash
cargo make build
```

This will build the smart contracts and output the optimized wasm files to the `./artifacts` directory.

If you wish to simply build but not produce the optimized wasm file artifacts, you can run `cargo make build-raw`

See the (Cargo Makefile)[./Makefile.toml] in the root of the workspace for where these build commands are defined.

Additionally, if you make changes to the deploy or test tools, you will need to recompile the typescript each time you make a change.

This can be done either via the command `npx tsc` or `npm run tsc` in the respective tool's root directory.

Alternatively and often more conveniently, you can run either `cargo make deploy-tool` or `cargo make test-tool` from the
root of the workspace to build either tool. `cargo make tools` will build both tools.

## The Test Tool

The `./test-tool` directory has a simple typescript tool to help with testing the contracts with typescript.

Once your workspace is setup, you can run the test tool with the command: `dega-inj-test <command> <spec-file-path>`

To get help with running the deploy tool, run: `dega-inj-deploy help [command]`

Also see the [test-tool README.md](./test-tool/) in the **./test-tool** directory for info / help.

## The Deployment Tool

The `./deploy` directory has a typescript deployment tool to deploy the smart contracts based on a deployment spec.

Once your workspace is setup, you can run the deploy tool with the command: `dega-inj-deploy <command> <sub-command> <args>`

To get help with running the deploy tool, run: `dega-inj-deploy help [command [subcommand]]`

Also see the [deploy README.md](./deploy/) in the **./deploy** directory for info / help.


## Upload and interact with your first smart contract
Once you have done the steps above, you can test if your workspace is working by using the CLI
to build and upload the contracts to your local net. 

(Include the receiver if you want to use the nft receiver tester contract to test the "send_nft" call which allows smart contracts to receive NFTs)
```bash
cargo make build
dega-inj-test tx store
dega-inj-test tx store receiver
```
You can then copy the codes you get back into their respective fields in your test-tool's .env file:

(Only include the receiver code line if you stored the receiver contract above.)
```bash
MINTER_CODE_ID_LOCAL=<minter_code_id>
CW721_CODE_ID_LOCAL=<cw721_code_id>
RECEIVER_CODE_ID_LOCAL=<receiver_code_id>
```
Now you can instantiate the Minter and Collection contracts with the following command:
```bash
dega-inj-test tx instantiate
```
You can now take back the addresses you receive and add them to your .env file:

(Again, only include the receiver address line if you stored the receiver contract above.)
```bash
MINTER_ADDRESS_LOCAL=<minter_address>
CW721_ADDRESS_LOCAL=<cw721_address>
RECEIVER_ADDRESS_LOCAL=<receiver_address>
```
Once you have specified these addresses, you will be able to use the respective query and transaction commands
for your local minter and collection contract.

See "dega-inj-test help query" and "dega-inj-test help tx" for more information on how to interact with the contracts.

Also note, by switching the NETWORK= setting to "Testnet" or "Mainnet" in the test-tool .env, you can interact
in the same way with contracts on those networks respectively.

## Unit / Integration Testing and Linting

To run the full suite of tests and linting, run the following command:
```bash
cargo make test
```

### Unit Testing
The rust code has numerous unit tests defined to test each of the smart contract's rust files and functions.

Run the unit tests with the following command:
```bash
cargo make unit-test
```

### Integration Testing
The test-tool and your local network are used to run integration tests on the smart contracts.

Run the integration tests with the following command:
```bash
cargo make int-test
```

The integration tests do the following: 
1. Look for codes that match the contracts in your artifacts directory in your local net
2. Instantiate new contracts with those codes
3. Generate a set of testing addresses and give them INJ tokens from your genesis address
4. Run a series of queries and transactions on the newly instantiated test contracts to test their functionality

As opposed to the unit-tests which test the contracts in isolation, the integration tests test the interconnected contracts
as a whole.

### Linting

You can test for best-practice issues with the code by running a lint on them with the following command:
```bash
cargo make lint
```

## Code Coverage

Code coverage checks can be run for both on the unit testing of the rust code and the integration
testing of the interface of the contracts.

### Unit Test Rust Code Coverage

Unit test code coverage is shown in text at the end of the `cargo make unit-test` command.

To check rust code coverage at the command line directly, run `cargo make unit-cov-text` or via a generated web report
via `cargo make unit-cov-html-open`.

If the open command does not work on your machine, you may need to manually navigate to the HTML file generated
by the open command and open it in your web browser manually.

Once you have generated a web based report, you can update it by running `cargo make unit-cov-html-update`.

### Integration Test Interface Coverage

Integration test coverage is shown at the end of the `cargo make int-test` command.

The interface coverage checks against the full set of read-only query and writable transaction execute messages
by checking the code coverage of the functions defined in the `./test-tool/src/helpers` directory, which wrap around
and use each type of query and transaction message.

## Schemas / Messages and Typescript Message Classes

### Typescript Message classes

Typescript classes that are in the structure of the instantiate, execute and query messages for the minter and
collection contracts can be found in the `deploy/tool/src/messages` or `test-tool/src/messages` directories.

Simply copy these classes into your typescript project to be able to use them.

See [./deploy/tool/src/deploy.ts](./deploy/tool/src/deploy.ts), [./test-tool/src/tx.ts](./test-tool/src/tx.ts), and
[./test-tool/src/query.ts](./test-tool/src/query.ts), for examples on using the classes in transactions and queries
to the Injective chain through a network node's gRPC endpoint.

### Generating schemas / typescript messages

- To generate schemas, run: `cargo make schema`
- To generate typescript messages, run: `dega-inj-test generate`. The built classes will be output to the 
`test-tool/generated-ts` directory.

## CosmWasm Rust Optimizer

Our workspace uses the CosmWasm Optimizer tool to build our contracts with the `cargo make build` command.

The Rust Optimizer is a tool built by the CosmWasm team to optimize the wasm files produced by the Rust compiler, and produce
them inside a docker container so they are produced in a discrete way, and the same workspace files produce the same wasm binary
bit for bit every time. This is allows their validation tooling to confirm a set of source files produced a given output if that
feature is desired.

The tool also ensures any personal / security sensitive information in hardcoded strings / file paths for example
is stripped from the output.

Our project uses "Workspace Optimizer" variant of the CosmWasm Optimizer tool, which is tailored to cargo workspace's such as ours.

Read more about the CosmWasm team's Rust Optimizer at their [github page here](https://github.com/CosmWasm/optimizer).
