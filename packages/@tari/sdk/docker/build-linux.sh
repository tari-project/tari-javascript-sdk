#!/bin/bash
set -e

echo "Building Linux x64..."
CARGO_BUILD_TARGET=x86_64-unknown-linux-gnu npm run build:native
mkdir -p /output/linux-x64
cp native/index.node /output/linux-x64/

echo "Building Linux ARM64..."
export CC=aarch64-linux-gnu-gcc
export CXX=aarch64-linux-gnu-g++
export AR=aarch64-linux-gnu-ar
export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc
CARGO_BUILD_TARGET=aarch64-unknown-linux-gnu npm run build:native
mkdir -p /output/linux-arm64
cp native/index.node /output/linux-arm64/

echo "Linux builds complete"
