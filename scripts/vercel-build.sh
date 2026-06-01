#!/bin/bash
# Robust build script for Vercel Monorepo

if [ -d "packages/web" ]; then
  echo "--- Detected root directory, moving to packages/web ---"
  cd packages/web
fi

echo "--- Current directory: $(pwd) ---"
echo "--- Directory contents: ---"
ls -F

if [ -f "package.json" ]; then
  echo "--- Found package.json, starting build ---"
  # Use local next if available, otherwise try bun run
  if [ -f "./node_modules/.bin/next" ]; then
    ./node_modules/.bin/next build
  else
    bun next build
  fi
else
  echo "!!! Error: package.json not found in $(pwd) !!!"
  exit 1
fi
