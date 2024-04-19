# DEGA Injective Smart Contracts Dev CLI

## Overview

See the instructions in the root [README.md](../README.md) for setting up the CLI.

The [wasm-deploy repo github page](https://github.com/cryptechdev/wasm-deploy), which the CLI is created from, has
more background information on the CLI.

The CLI comes equipped with a help command run via `dega-inj help` from wasm-deploy which 
gives a full list of available commands.

Run `dega-inj help <command>` for more information on a specific command.

Use `dega-inj test <command> <args>` as a shorthand which calls the typescript test tool with the remaining arguments

## Usage

to fully deploy the smart contracts for development call the following commands:

```bash
dega-inj build
dega-inj store-code -c dega-minter
dega-inj store-code -c dega-cw721
dega-inj instantiate -c dega-cw721
```

Use `dega-inj schema` to build the rust schemas

## Subcommands

The `subcommand.rs` file has some subcommands added for this project to the CLI.

These include:

- `dega-inj test`: which calls the test tool
- `dega-inj signinfo`: which gives a full diagnostic of signing related information that was used in developing 
and repairing signing related functionality
- `dega-inj mint`: which tests minting of a token using the signature mint

## Injective Key Issue

The CLI uses Cosmos based keys, which generate a different inj<address-string> address then ethereum
based keys do. Due to this, the typescript functionality and CLI use different addresses for the same private key.

You will need to upload seperate contracts when you use the test tool.

