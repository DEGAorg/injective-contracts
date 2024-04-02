# DEGA Injective Smart Contracts

This repository contains the smart contracts for the DEGA platform on Injective.

## Workspace Setup

### Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
- Follow the on screen instructions
```bash
rustup target add wasm32-unknown-unknown
```

### Update the workspace

```bash
cargo update
```

### Install needed tools for the workspace
```bash
cargo install --no-default-features --force cargo-make
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
