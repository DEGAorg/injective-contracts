# DEGA Injective Smart Contract Deployment

## Overview

This **deploy** directory contains the deployment tool, and all the directories relating to it.

## Usage

The primary way the tool is meant to be run is via the `./deploy.sh` script at the root of the workspace.

The calling paradigm is 
```bash
./deploy.sh <spec-file>
```
With `<spec-file>` path relative to deploy directory.

The tool could also be called either via npm using `npm run deploy <spec-file>` from inside the deploy directory,

or directly through node using `node deploy/dist/deploy.js <spec-file>`.

## Sub-directories

### artifacts

The **artifacts** directory inside here contains all the files that result from the deployment process.

This includes:

**checksums.txt** - A file containing the discrete checksums of the wasm files products by CosmWasm's "WorkspaceOptimizer" tool.
See more info in the Rust Optimizer section at the bottom.

**dega_cw721.wasm** - The compiled wasm binary for the CW721 / Collection Smart Contract.

**dega_minter.wasm** - The compiled wasm binary for the Minter Smart Contract.

**deploy-output.json** - A structured JSON file containing the key outputs of the build. Currently this includes the
code-ids from the store-code commands on the target deployment network for any codes that were stored, and the resulting
addresses of the minter and cw721 contracts if they were instantiated. Note that *both* addressed will always be included
in instantiatations, as the minter contract always instantiates the paired cw721 collection contract it owns.

**deploy-log.txt** - A log file showing the full console output of all commands and sub-commands from the last deployment.

**deploy-error.txt** - A log file showing any error that occurred during the last build which caused the build to fail.

NOTE: As one implementation detail worth mentioning, both the CLI library used (wasm deploy), and the rust optimizer by
convention build their artifacts to the **artifacts** directory in the root of the workspace. To avoid any bugs
where the artifacts from development in the CLI are co-mingled with the production artifacts, this deploy tool 
deletes any existing artifacts in the workspace artifacts directory at the start of a new optimization process, and
stores all of it's artifacts in it's own distinct artifacts directory inside the deploy directory. During optimization
it moves the checksum and binary files from the workspace artifacts directory output by rust optimizer into the deploy
artifacts directory.

### private-keys

The **private-keys** directory contains the private key mnemonic or seed hash files used for deployment transactions.

The directory contains two versioned example private keys to show the format of a mnemonic key and seed hash key.

The directory by default is ignored in version control.

These keys can be referenced in the **privateKeyFilename** property of the build spec. That property specifies a file
name (and if desired a path) relative to this private-keys subdirectory.

### specs

This is a directory intended to hold both versioned and unversioned build specs.

Unversioned build specs can be put directly in the directory and will be ignored.

Version build specs should be put in the "versioned" directory, and will be detected by version control.

The first argument to the deployment tool specifies the relative path to the desired spec file inside this directory.

### tool

Contains the typescript source of the deployment script and project. All the code is put in a single deploy.ts file.

## Build Specs

The build spec via a build-spec file acts as the arguments for the deployment, and are limited to specification through the spec
file for simplicity. For each deployment a single spec-file is specified.

### Build Spec Files

When you run a deployment, you **must** specify the relative path / name of a build spec file to use.

The path is relative to the **specs** directory inside the **deploy** directory
(<workspace-path>/deploy/specs/<my-spec-file>.json)

### Build Spec Properties

The following properties are currently present in a specfile.

Most properties are required and thus must be specified. If not flagged as optional below, that property is required.

Certain properties are optional (also shown below), which may be omitted, or specified
as null if they are not needed. Specifying as null was made possible so optional properties can be
left in the build spec as a reminder of their availability.

`"privateKeyFilename": "dev-mnemonic.json",` - The filename of the private key mnemonic file to use for deployment.
This key will be used to submit the store-code and instantation transactions to the target network.

`"network": "Testnet",` - The target network for the deployment. Options are **Mainnet**, **Testnet** and **Local**.
This is used to specify which network to deploy to, and sets up the network-id and endpoints
based on the network selected.

`"grpcEndpoint": null,` (Optional) - The gRPC endpoint which is used to submit the deployment transactions through.
gRPC endpoints in CosmWasm are nodes connected to the injective network capable of querying the network for information
and submitting transactions. See more information here in the Injective
[Interacting with a node article](https://docs.injective.network/nodes/interact-node) from the docs.
If not specified the tool will use a default gRPC endpoint for the given network that is configured in the 
injective typescript library.

`"optionsBuildAndOptimize": true,` - Use this to determine whether to run the optimizer to build and optimize fresh 
wasm files to the deploy/artifacts directory, or to use the binaries from the previous build (for example for testing, 
or to deploy a specific set of final binaries that are already finalized).

`"optionsStoreCodeForMinter": true,` - Whether to upload the minter contract binary, or use an already uploaded binary on the chain.
If set to false, the **preExistingMinterCodeId** property below **must** be specified.

`"preExistingMinterCodeId": 12345 or null,` (Optional) - If not storing code for the minter - specify the code id for the binary
already on the chain to use for instantiating the minter smart contract instance.

`"optionsStoreCodeForCw721": true,` - Whether to upload the CW721 / collection contract binary, or use an already uploaded binary on the chain.
If set to false, the **preExistingCW721CodeId** property below **must** be specified.

`"preExistingCw721CodeId": 12345 or null,` (Optional) - If not storing code for the CW721 collection contract - specify the code id for the binary
already on the chain to use for instantiating the minter smart contract instance.

`"optionsInstantiate": true,` - Whether to instantiate the minter and cw721 contracts after storing the code binaries.

`"optionsMigrateMinter": false,` - Whether to migrate the minter contract. If set to true, the **minterAddressForMigration** property below **must** be specified.

`"minterAddressForMigration": "inj1dy6zq408day25hvfrjkhsrd7hn6ku38x2f8dm6",` (Optional) - The injective address of the minter contract to migrate.

`"optionsMigrateCw721": false,` - Whether to migrate the cw721 contract. If set to true, the **cw721AddressForMigration** property below **must** be specified.

`"cw721AddressForMigration": "inj1dy6zq408day25hvfrjkhsrd7hn6ku38x2f8dm6",` (Optional) - The injective address of the cw721 contract to migrate.

`"collectionName": "Test collection",` - The name of the collection in the collection properties of the CW721 contract.

`"collectionSymbol": "TEST",` - The ticker symbol of the collection in the collection properties of the CW721 contract.
Note, this shows up as the "Denom" in the injective finder.

`"collectionCreator": "inj1dy6zq408day25hvfrjkhsrd7hn6ku38x2f8dm6",` - The injective address of the creator of the collection,
as exists in the default implementation of the stargate NFT contracts.

`"collectionDescription": "This is a test collection",` - A description for the collection stored and queryable in the 
smart contract.

`"collectionImageURL": "https://storage.googleapis.com/dega-banner/banner.png",` - An image for the collection 
stored and queryable in the smart contract.

`"collectionExternalLinkURL": "https://realms.degaplatform.com/",` - An external link for the collection stored and queryable in the smart contract.

`"collectionExplicitContent": null,` (Optional) - Whether the collection contains explicit content. Stored and queryable in the smart contract.

`"collectionStartTradingTime": null,` (Optional) - A holdover from the Stargaze CW721 contract, does not work outside the stargaze chain but could be implemented.

`"collectionSecondaryRoyaltyPaymentAddress": "inj1dy6zq408day25hvfrjkhsrd7hn6ku38x2f8dm6",` - The injective address of the secondary royalty payment address for the collection.

`"collectionSecondaryRoyaltyShare": "0.05",` - The secondary market royalty share to use across the collection. .05 = 5%

`"cw721ContractLabel": "DEGA Collection - Test Collection",` - A label for the instantiated collection smart contract. 
This shows up at the top of the page in the finder when you browse to the collection contract's address as the name of 
the contract.

`"cw721ContractMigratable": false,` - Whether the CW721 contract should be migratable. If set to true, the **cw721MigrateAdmin** property below **must** be specified.

`"cw721MigrateAdmin": null or "inj1dy6zq408day25hvfrjkhsrd7hn6ku38x2f8dm6",` (Optional) - The injective address of the **root** admin to give permission to migrate the code ID of the CW721 contract being instantiated.

`"minterSignerPubKeyBase64": "A9tu/MCgtgLwbz+UcyIc/kPB38+6k3BP895SShKV6eRR",` - The compressed ECDSA public "Verification"
key for the mint transaction signer. Stored in the minter contract to verify mint signatures. This is the binary
verification key encoded as a Base64 string, which is also how it is stored on the chain.

`"minterBurningPaused": false,` - Whether burning should initially be in a paused state when the contract is instantiated.

`"minterMintingPaused": false,` - Whether minting should initially be in a paused state when the contract is instantiated.

`"minterTransferringPaused": false,` - Whether transferring should initially be in a paused state when the contract is instantiated.

`"minterInitialAdmin": "inj1dy6zq408day25hvfrjkhsrd7hn6ku38x2f8dm6",` - The injective address of the initial admin of the minter contract.

`"minterContractLabel": "DEGA Minter - Test Collection"` - A label for the instantiated minter smart contract.
This shows up at the top of the page in the finder when you browse to the minter contract's address as the name of
the contract.

`"minterContractMigratable": false,` - Whether the minter contract should be migratable. If set to true, the **minterMigrateAdmin** property below **must** be specified.

`"minterMigrateAdmin": null or "inj1dy6zq408day25hvfrjkhsrd7hn6ku38x2f8dm6"` (Optional) - The injective address of the **root** admin to give permission to migrate the code ID of the minter contract being instantiated.

## CosmWasm Rust Optimizer

The Rust Optimizer is a tool built by the CosmWasm team to optimize the wasm files produced by the Rust compiler, and produce
them inside a docker container so they are produced in a discrete way, and the same workspace files produce the same wasm binary
bit for bit every time. This is allows their validation tooling to confirm a set of source files produced a given output if that
feature is desired.

The tool also ensures any personal / security sensitive information in hardcoded strings / file paths for example 
is stripped from the output.

Our project uses "Workspace Optimizer", the cargo "workspace" oriented variant of CosmWasm's Rust Optimizer.

Read more about the CosmWasm team's Rust Optimizer at their [github page here](https://github.com/CosmWasm/optimizer).
