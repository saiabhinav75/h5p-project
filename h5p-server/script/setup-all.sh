#!/bin/bash

# File containing library list
LIB_FILE="libraries.txt"

# File that logs completed libraries
DONE_FILE="completed.txt"

# Ensure the completed file exists
touch "$DONE_FILE"

# Install core libs first (if not already done)
if ! grep -q "^core_done$" "$DONE_FILE"; then
  echo "🔹 Installing core H5P libs"
  h5p core
  echo "core_done" >> "$DONE_FILE"
fi

# Loop through each library
while IFS= read -r lib; do
  # Skip empty lines
  if [ -z "$lib" ]; then
    continue
  fi

  # If this library is already done, skip it
  if grep -q "^$lib$" "$DONE_FILE"; then
    echo "⚡ Already completed $lib, skipping..."
    continue
  fi

  # Run setup for this library
  echo "➡ Setting up $lib ..."
  h5p setup "$lib"

  # Mark as completed
  echo "$lib" >> "$DONE_FILE"

done < "$LIB_FILE"

echo "🎉 All libraries processed!"
