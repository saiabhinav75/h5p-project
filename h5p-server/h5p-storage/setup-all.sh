#!/bin/bash

# File containing library list
LIB_FILE="libraries.txt"

# Loop through each library
while IFS= read -r lib; do
  # Skip empty lines
  if [ -z "$lib" ]; then
    continue
  fi

  # Run setup for this library
  echo "➡ Setting up $lib ..."
  h5p setup "$lib"

  # Mark as completed

done < "$LIB_FILE"

echo "🎉 All libraries processed!"
