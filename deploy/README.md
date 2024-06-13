# DEGA Injective Smart Contract Deployment

## Overview

This `./deploy` directory contains the deployment tool, and all the directories relating to it.

The deploy tool is a typescript tool that can be used to generate transaction JSON files for the key transactions
used for deployments of the smart contracts.

Its purpose is to allow these deployments to be done in a predictable build-like manner to ensure goverance proposals
and instantiations in particular are done in a consistent mistake-free manner.

This is critical as a simple mistake such as specifying the incorrect instantiate permissions or admins could lead to
situations where the contracts from a governance proposal cannot be used, or we become locked out of or 
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


## JSON Artifact Files

The deploy tool generates JSON files that contain the transaction data for the key transactions used in the deployment process.

The files are generated in the `./deploy/artifacts` directory, and are named with the following format:

For safety, the contents of the artifacts directory are deleted during each run, to reduce the chance of accidentally using an transaction
file for the wrong thing.

The execption to this is the `sign` command, which does not delete whatever is in the artifacts directory, to allow for signing
of a JSON transaction file that was produced there previously.

## Spec-Files

Each command requires a spec-file to be passed in. This is a JSON file that contains all the information needed to 
generate the transaction JSON file.

Each command has a different spec-file format, use the help command for each command to see the full list of properties:

```bash
dega-inj-deploy help <command>
```

You can find examples of spec-files for each of the commands in the [./deploy/specs/versioned/examples](./specs/versioned/examples) directory.

### Common Properties

Certain properties in the spec-file are optional. Such properties are marked with the type `T | undefined | null`, to
allow the property to be left out, or provided intentionally with a null value to leave in the property in the spec file but not specify it.

Most of the properties are unique to each file, but a few properties such as "contractVariant" are in multiple files.

The following properties are in every spec file:

**network** - "Local", "Testnet" or "Mainnet", indicates the network to generate the transaction for.

**note** - A string that will be included in the transaction JSON file as a note.

The property `deployAddress` indicates the address of the deployer account that will be used to sign and deploy the contracts for each
of the transaction commands (gov-prop, instantiate, migrate). 

The `sign` command instead has "signerKeyName" which is the name of the key in the local injectived keystore to sign the transaction with.

### File Path Properties

Finally, the properties wasmPath", "summaryFilePath" and "txJsonFilePath" all require file paths to be provided.

Each of the paths must be specified with one of the following 3 syntaxes:

1. <workspaces>/path/to/file - To specify a file relative to the workspace root `./`.
2. <deploy>/path/to/file - To specify a file relative to the `./deploy` directory.
3. /root/path/to/file - To specify an absolute path from the root of the operating system.
