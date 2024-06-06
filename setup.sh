#!/bin/bash

# Change the working directory to the directory of the script
cd "$(dirname "$0")"

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env.fish"

# Install the wasm target for Rust
rustup target add wasm32-unknown-unknown

# Update the Rust dependencies
cargo update

# Install cargo make
cargo install --no-default-features --force cargo-make

# Install LLVM rust code coverage tool
cargo install cargo-llvm-cov

# Install twiggy for binary size profiling
cargo install twiggy

# Install the deploy tool dependencies and dega-inj-deploy command
(cd deploy/tool && npm install)
npm install -g ./deploy/tool

# Install the test tool dependencies and dega-inj-test command
(cd test-tool && npm install)
npm install -g ./test-tool