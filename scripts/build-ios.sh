#!/usr/bin/env bash
# Builds the web app, copies it into the iOS target, and generates the Xcode
# project. Run from the repository root. Requires Node 20+ and XcodeGen.
set -euo pipefail

cd "$(dirname "$0")/.."

npm ci
npm run build

rm -rf ios/Aether/Web
mkdir -p ios/Aether/Web
cp -R dist/. ios/Aether/Web/

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "xcodegen is missing: brew install xcodegen" >&2
  exit 1
fi

cd ios
xcodegen generate
echo "Open ios/Aether.xcodeproj, choose your Team and Bundle Identifier, then Run."
