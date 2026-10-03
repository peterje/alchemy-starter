#!/bin/sh
# Clones the source of the Effect and Alchemy versions this workspace installs into `.repos/`, so
# agents read the real APIs and examples instead of guessing. Rerun after upgrading either one.
set -eu

clone() {
  rm -rf ".repos/$3"
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$2" "https://github.com/$1" ".repos/$3"
  echo "$3 at $2"
}

clone Effect-TS/effect "effect@$(node -p 'require("./node_modules/effect/package.json").version')" effect
clone alchemy-run/alchemy "v$(node -p 'require("./node_modules/alchemy/package.json").version')" alchemy
