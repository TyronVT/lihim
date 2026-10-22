#!/usr/bin/env bash
# Deploy LihimVerifier -> LihimSemaphore -> LihimPolls to testnet and load the
# 32 Semaphore V4 verification keys. Not run by CI; run it by hand.
#
#   SOURCE=lihim-deployer ./scripts/deploy-testnet.sh
#
# SOURCE is a `stellar keys` identity (created + funded if missing). It pays
# fees and is the verifier admin until `finalize` removes that role.
# MIN_MEMBERS (default 8) and FIRST_POLL_ID (default 1) are constructor args;
# when redeploying polls against an existing semaphore, set FIRST_POLL_ID above
# every poll id the old deployment used (scope = poll id).
set -euo pipefail

cd "$(dirname "$0")/.."
NETWORK="${NETWORK:-testnet}"
SOURCE="${SOURCE:-lihim-deployer}"
MIN_MEMBERS="${MIN_MEMBERS:-8}"
FIRST_POLL_ID="${FIRST_POLL_ID:-1}"
FINALIZE="${FINALIZE:-yes}"
WASM=target/wasm32v1-none/release

if ! stellar keys address "$SOURCE" >/dev/null 2>&1; then
    stellar keys generate "$SOURCE" --network "$NETWORK" --fund
fi
ADMIN="$(stellar keys address "$SOURCE")"

stellar contract build

VERIFIER="$(stellar contract deploy --wasm "$WASM/lihim_verifier.wasm" \
    --source-account "$SOURCE" --network "$NETWORK" --alias lihim-verifier \
    -- --admin "$ADMIN")"
echo "LihimVerifier:  $VERIFIER"

for depth in $(seq 1 32); do
    stellar contract invoke --id "$VERIFIER" --source-account "$SOURCE" --network "$NETWORK" \
        -- set_vk --depth "$depth" --vk "$(cat "vks/$depth.json")" >/dev/null
    echo "  vk depth $depth loaded"
done

if [ "$FINALIZE" = "yes" ]; then
    stellar contract invoke --id "$VERIFIER" --source-account "$SOURCE" --network "$NETWORK" -- finalize
    echo "  verifier finalized (admin role removed)"
fi

SEMAPHORE="$(stellar contract deploy --wasm "$WASM/lihim_semaphore.wasm" \
    --source-account "$SOURCE" --network "$NETWORK" --alias lihim-semaphore \
    -- --verifier "$VERIFIER")"
echo "LihimSemaphore: $SEMAPHORE"

POLLS="$(stellar contract deploy --wasm "$WASM/lihim_polls.wasm" \
    --source-account "$SOURCE" --network "$NETWORK" --alias lihim-polls \
    -- --semaphore "$SEMAPHORE" --min_members "$MIN_MEMBERS" --first_poll_id "$FIRST_POLL_ID")"
echo "LihimPolls:     $POLLS"

cat <<ENV

# paste into the app / relay / edge function env
LIHIM_VERIFIER_ID=$VERIFIER
LIHIM_SEMAPHORE_ID=$SEMAPHORE
LIHIM_POLLS_ID=$POLLS
ENV
