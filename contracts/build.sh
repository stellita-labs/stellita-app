#!/usr/bin/env bash
# Reproducibly build the catalog of deployable contract WASM.
#
# OpenZeppelin's stellar-contracts ships NO prebuilt WASM (release assets are
# empty) — it is a cargo workspace of Rust crates plus an examples/ directory of
# deployable contracts. We compile a curated set of those examples ONCE here and
# commit the resulting .wasm. The server deploys the committed WASM and passes
# the user's config to each contract's `__constructor`; it never runs Rust.
#
# Requirements (build machine only, NOT the server):
#   - rust + cargo, target wasm32-unknown-unknown
#   - stellar-cli >= 25.2.0  (soroban-sdk 26 needs experimental_spec_shaking_v2)
#
# Usage: ./contracts/build.sh
#   OUT=<dir> ./contracts/build.sh   # write into <dir> instead of contracts/wasm
#
# Every run writes <OUT>/SHA256SUMS (regenerated from the bytes we just built).
# That file is committed and is the source of truth the `contracts` CI job
# compares a fresh build against — never hand-edit it.
set -euo pipefail

OZ_REPO="https://github.com/OpenZeppelin/stellar-contracts.git"
OZ_TAG="v0.7.2"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/.oz-src"
OUT="${OUT:-$HERE/wasm}"

# Curated catalog: <cargo package> -> <output wasm name>.
# Add a line here + a manifest in contracts/manifests/ to offer a new contract.
CATALOG=(
  "ownable-example:ownable"
  "fungible-pausable-example:fungible-token"
  "nft-sequential-minting-example:nft"
)

if [ ! -d "$SRC/.git" ]; then
  echo "→ Cloning OpenZeppelin stellar-contracts $OZ_TAG …"
  git clone --depth 1 --branch "$OZ_TAG" "$OZ_REPO" "$SRC"
fi

mkdir -p "$OUT"
HASH_TMP="$OUT/SHA256SUMS.tmp"
: > "$HASH_TMP"

for entry in "${CATALOG[@]}"; do
  pkg="${entry%%:*}"
  name="${entry##*:}"
  echo "→ Building $pkg → $name.wasm"
  ( cd "$SRC" && stellar contract build --package "$pkg" >/dev/null )
  # stellar-cli emits the package name with underscores under wasm32v1-none.
  wasm="$SRC/target/wasm32v1-none/release/${pkg//-/_}.wasm"
  cp "$wasm" "$OUT/$name.wasm"
  # One "<sha256>  <name>.wasm" line per contract, exactly as `shasum` prints it.
  hash_line="$(cd "$OUT" && shasum -a 256 "$name.wasm")"
  printf '%s\n' "$hash_line" >> "$HASH_TMP"
  printf "   %s  (%s bytes)\n" "${hash_line%% *}" "$(wc -c <"$OUT/$name.wasm" | tr -d ' ')"
done

# Sort by file name so the file is stable regardless of CATALOG order.
sort -k 2 "$HASH_TMP" > "$OUT/SHA256SUMS"
rm -f "$HASH_TMP"

echo "✅ Catalog built into $OUT/ (SHA256SUMS written)"
