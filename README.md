# DEGA Injective Smart Contracts

This repository contains the smart contracts for the DEGA platform on Injective.

## Workspace Setup for Deployment

### Pre-requisite Requirements
- Node / NPM (for deploy tool)
- Docker (for rust-optimizer)

### Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env.fish"
```
- Follow the on screen instructions
```bash
rustup target add wasm32-unknown-unknown
```

### Update the workspace

```bash
cargo update
```

### Install Cargo Make

```bash
cargo install --no-default-features --force cargo-make
```

### Build the CLI

It is suggested to build the CLI so you can run "dega-inj test <command>" 
to run the test tool from the root
```bash
cargo update-cli
```

### Install the Deploy Tool

Run this if you're planning to run deployments
```bash
(cd deploy/tool && npm install)
```

### Install the Deploy Tool

Run this if you're planning to use the test-ool
```bash
(cd test-tool && npm install)
```

## Further Workspace Setup for Development

### Install Wasm Opt
```bash
npm i wasm-opt -g
```
- You will need to install npm on your system if you don't have it to install wasm-opt
- If you want to run production builds (which use CosmWasm's rust-optimizer tool) you will need to install docker
and ensure the docker service is running

### Install and setup the workspace CLI
```
cargo update-cli
(cd .wasm-deploy && cp sample-config.josn config.json)
```
- The command above copies a default CLI config checked into version control to be yours to modify
- You will need to open .wasm-deploy/config.json in the workspace and add your test private key mnemonic 
at the bottom of the file inside the empty quotes here:
```json
  "keys": [
    {
      "name": "devkey",
      "key": {
        "Mnemonic": "<Insert your mnemonic here>"
      }
    }
  ]
```
### Upload and interact with your first smart contract
- Once you have done the steps above, you can test if your workspace is working by using the CLI
to upload and interact with a simple contract
```bash
dega-inj install
dega-inj store-code -c dega-cw721
dega-inj instantiate -c dega-cw721
dega-inj execute dega-cw721
```
- Call `cargo update-cli` whenever you need to rebuild and relink the CLI for the dega-inj command

## Schemas / Messages and Typescript Message Classes

### Typescript Message classes

Typescript classes that are in the structure of the the instantiate, execute and query messages for the minter and
collection contracts can be found in the `deploy/tool/src/messages` or `test-tool/src/messages` directories.

Simply copy these classes into your typescript project to be able to use them.

See [./deploy/tool/src/deploy.ts](./deploy/tool/src/deploy.ts), [./test-tool/src/tx.ts](./test-tool/src/tx.ts), and
[./test-tool/src/query.ts](./test-tool/src/query.ts), for examples on using the classes in transactions and queries
to the Injective chain through a network node's gRPC endpoint.

### Generating schemas / typescript messages

- To generate schemas: `dega-inj schema`
- To generate typescript messages `dega-inj test generate`. The built classes will be output to the 
`test-tool/generated-ts` directory.

## Deplyment Tool

The `/deploy` directory has a typescript deployment tool to deploy the smart contracts based on a deployment spec.

See the [deploy README.md](./deploy/) in the **./deploy** directory for info / help.

## Development CLI

The `/cli` directory has a rust based development CLI to do extensive querying, deployment and interacting with
the smart contracts via the command line.

Run `cargo update-cli` to install and update the CLI.

Run `dega-inj <command>` to use the CLI.

See `dega-inj help` for help on the commands available.

See the [cli README.md](./cli/) in the **./cli** directory for info / help.

The [wasm-deploy repo github page](https://github.com/cryptechdev/wasm-deploy), which the CLI is created from, has
more background information on the CLI.

As an important note, `dega-inj test <command>` is a shorthand which calls the test tool with the remaining arguments

## Test Tool

The `/test-tool` directory has a simple typescript tool to help with testing the contracts with typescript.

See the [test-tool README.md](./test-tool/) in the **./test-tool** directory for info / help.
