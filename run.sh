#!/bin/bash

# This script allows you to run simulations and then quickly switch to 
# interactive watch mode by appending '--watch' to your command.

WATCH=false
ARGS=()

for arg in "$@"; do
  if [[ "$arg" == "--watch" ]]; then
    WATCH=true
  else
    ARGS+=("$arg")
  fi
done

if [ "$WATCH" = true ]; then
  # Launch interactive visualizer
  exec npx tsx game.ts --watch "${ARGS[@]}"
else
  # Run batch simulation
  exec npx tsx sim.ts "${ARGS[@]}"
fi
