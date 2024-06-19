#!/bin/bash

# Change the working directory to the directory of the script
cd "$(dirname "$0")"

# Point the deploy and test tools to the current workspace
npm install -g ./deploy/tool
npm install -g ./test-tool