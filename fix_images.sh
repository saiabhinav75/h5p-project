#!/bin/bash
set -e

# Create temp extraction dir
mkdir -p temp_extract_fix
unzip -q sample.h5p -d temp_extract_fix

# Ensure destination exists
mkdir -p h5p-storage/content/1

# Move ALL files/folders from the internal 'content' directory to the storage directory
# We use cp -r to be safe and overwrite existing
cp -r temp_extract_fix/content/* h5p-storage/content/1/

# Clean up
rm -rf temp_extract_fix

echo "Fixed content assets for ID 1."
ls -R h5p-storage/content/1
