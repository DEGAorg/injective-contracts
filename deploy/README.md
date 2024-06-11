# DEGA Injective Smart Contract Deployment

## Overview

This `./deploy` directory contains the deployment tool, and all the directories relating to it.

The deploy tool is a typescript tool that can be used to generate transaction JSON files for the key transactions
used for deployments of the smart contracts.

Its purpose is to allow these deployments to be done in a predictable build-like manner to ensure goverance proposals
and instantiations in particular are done in a consistent mistake-free manner.

This is critical as a simple mistake such as specifying the incorrect instantiate permissions or admins could lead to
situations where the the contracts from a governance proposal cannot be used, or we become locked out of or 
unable to mint from a production contract.

## Usage

The primary way the tool is meant to be run is via the `dega-inj-deploy` command.

The calling paradigm is 
```bash
dega-inj-deploy <command> <spec-file>
```
Where "command" is a command such as `intantiate` or `gov-prop` (see a full list of commands below), and where `<spec-file-path>` is the path to a valid spec-file
for the command you are running. (relative to your current directory)

The tool could also be called either via npm using `npm run deploy <spec-file>` from inside the `./deploy/tool` directory.

or directly through node using `node dist/deploy.js <command> <spec-file>` again from inside the `./deploy/tool` directory.

## Commands

The following commands are available for the deployment tool:

1. `instantiate <spec-file-path>` - To create a JSON for a transaction to instantiate the minter and collection contracts.
2. `gov-prop <spec-file-path>` - To create a JSON for a transaction to propose a governance proposal to store the minter and collection contracts.
3. `migrate <spec-file-path>` - To create a JSON for a transaction to migrate the minter or collection contracts.
4. `sign <spec-file-path> [<transction-file-path>]` - To sign a transaction JSON file with a private key from your injectived install's local keystore.
5. `help [<command>]` - To get the help info for the deployment tool, or a specific command.

Run `dega-inj-deploy help <command>` for more detailed info on each command, and the full list of properties in the spec file.
