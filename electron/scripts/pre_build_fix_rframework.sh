#!/bin/bash
set -e

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
R_FRAMEWORK_SRC="/Library/Frameworks/R.framework"
R_FRAMEWORK_DEST="$APP_ROOT/resources/R.framework"

echo "=== macOS Pre-Build: Preparing R.framework (flat) ==="
echo "App root: $APP_ROOT"

# Clean old copy
rm -rf "$R_FRAMEWORK_DEST"

# Copy framework
mkdir -p "$APP_ROOT/resources"
cp -R "$R_FRAMEWORK_SRC" "$R_FRAMEWORK_DEST"

cd "$R_FRAMEWORK_DEST"

# Detect current version
CURRENT_VERSION=$(readlink Versions/Current || ls Versions | sort -V | tail -n 1)
echo "Detected Current R version: $CURRENT_VERSION"

# Flatten "Current" into top-level
for ITEM in Headers Resources PrivateHeaders Libraries; do
  SRC_PATH="Versions/$CURRENT_VERSION/$ITEM"
  if [ -d "$SRC_PATH" ]; then
    echo "Copying $ITEM from $SRC_PATH"
    rm -rf "$ITEM"
    cp -R "$SRC_PATH" "$ITEM"
  else
    echo "$ITEM missing in $SRC_PATH — creating empty folder"
    rm -rf "$ITEM"
    mkdir "$ITEM"
  fi
done

# Remove all Versions dirs
echo "Removing Versions folders..."
find . -type d -name "Versions" -exec rm -rf {} +

# Sanity check
RSCRIPT_PATH="$R_FRAMEWORK_DEST/Resources/bin/Rscript"
if [ ! -f "$RSCRIPT_PATH" ]; then
  echo "ERROR: Rscript not found at $RSCRIPT_PATH"
  exit 1
fi

echo "R.framework prepared flat under resources/"
