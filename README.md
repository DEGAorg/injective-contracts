# DEGA Injective Smart Contracts

This repository contains the smart contracts for the DEGA platform on Injective.



## Workspace Setup 

### Pre-requisite Requirements
- Node / NPM (for deploy tool)
  - Powers the test and deployment tools
- Docker (for rust-optimizer
  - Needed to run the "cargo make build" command to buidl optimized contracts
- Linux (or WSL)
  - Needed for injectived and numerous bash commands within typescript

### Setup script
First run the following script in the workspace root to set up your workspace:
```bash
./setup.sh
```

### Setting up the Test Tool .env file

The test tool uses a .env file for a number of settings, in particular mnemonics, code ID's and contract addresses.

The setup script above created a default .env file at "test-tool/.env".

Open this file and enter mnemonics secret words into the following fields:

```bash
PRIVATE_KEY_MNEMONIC=
SIGNER_KEY_MNEMONIC=
```

### Setting up injectived locally

If you wish to test locally, or run integration tests, you will need to setup the injectived program.

The latest chain release for Injective can be found here: https://github.com/InjectiveLabs/injective-chain-releases/releases

If you look in the assets section, you can download the linux-amd64 binaries for the latest release.

Follow the following instructions from the github page to install:
```bash
unzip <path-to>/linux-amd64.zip
sudo mv injectived peggo /usr/bin
sudo mv libwasmvm.x86_64.so /usr/lib
```

You should now have the "injectived" command.

Now run:
```bash
injectived init myNode
```
To initialize your local chain.

Finally, when you receive the output of the command, look for the "genesis" key mnemonic secret words.

Copy these words to follow the "LOCAL_GENESIS_MNEMONIC=" field in your .

This will give your test-tool access to the genesis account so that it can fill other accounts.

Use the command "dega-inj-test tx refill-local" to refill addresses on your local testnet.

## The Test Tool

The `/test-tool` directory has a simple typescript tool to help with testing the contracts with typescript.

Once your workspace is setup, you can run the test tool by running "dega-inj-test <args>"

See the [test-tool README.md](./test-tool/) in the **./test-tool** directory for info / help.

## The Deployment Tool

The `/deploy` directory has a typescript deployment tool to deploy the smart contracts based on a deployment spec.

Once your workspace is setup, you can run the deploy tool by running "dega-inj-deploy <args>"

See the [deploy README.md](./deploy/) in the **./deploy** directory for info / help.


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
```bash
MINTER_CODE_ID_LOCAL=<minter_code_id>
CW721_CODE_ID_LOCAL=<cw721_code_id>
RECEIVER_CODE_ID_LOCAL=<receiver_code_id (if uploaded)>
```
Now you can instantiate the Minter and Collection contracts with the following command:
```bash
dega-inj-test tx instantiate
```
You can now take back the addresses you receive and add them to your .env file:
```bash
MINTER_ADDRESS_LOCAL=<minter_address>
CW721_ADDRESS_LOCAL=<cw721_address>
RECEIVER_ADDRESS_LOCAL=<receiver_address (if instantiated)>
```
Once you have specified these addresses, you will be able to use the respective query and transaction commands
for your local minter and collection contract.

See "dega-inj-test query" and "dega-inj-test tx" for more information on how to interact with the contracts.

Also note, by switching the NETWORK= setting to "Testnet" or "Mainnet" in the test-tool .env, you can interact
in the same way with contracts on those networks respectively.

## Schemas / Messages and Typescript Message Classes

### Typescript Message classes

Typescript classes that are in the structure of the the instantiate, execute and query messages for the minter and
collection contracts can be found in the `deploy/tool/src/messages` or `test-tool/src/messages` directories.

Simply copy these classes into your typescript project to be able to use them.

See [./deploy/tool/src/deploy.ts](./deploy/tool/src/deploy.ts), [./test-tool/src/tx.ts](./test-tool/src/tx.ts), and
[./test-tool/src/query.ts](./test-tool/src/query.ts), for examples on using the classes in transactions and queries
to the Injective chain through a network node's gRPC endpoint.

### Generating schemas / typescript messages

- To generate schemas: `cargo make schema`
- To generate typescript messages `dega-inj-test generate`. The built classes will be output to the 
`test-tool/generated-ts` directory.