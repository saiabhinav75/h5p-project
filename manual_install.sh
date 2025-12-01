#!/bin/bash
set -e

# Create temp extraction dir
mkdir -p temp_extract
unzip -q sample.h5p -d temp_extract

# Ensure storage dirs exist
mkdir -p h5p-storage/libraries
mkdir -p h5p-storage/content/1

# Move libraries (folders starting with H5P. or FontAwesome or jQuery)
# We just move everything that is a directory and not 'content'
for dir in temp_extract/*/; do
    dirname=$(basename "$dir")
    if [ "$dirname" != "content" ]; then
        echo "Installing library: $dirname"
        # Remove existing if any to avoid conflicts
        rm -rf "h5p-storage/libraries/$dirname"
        mv "$dir" "h5p-storage/libraries/"
    fi
done

# Move content
mv temp_extract/content/content.json h5p-storage/content/1/
mv temp_extract/h5p.json h5p-storage/content/1/

# Clean up
rm -rf temp_extract

echo "Manual installation of content ID 1 complete."
