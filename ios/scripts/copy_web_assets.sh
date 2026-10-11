#!/bin/sh
# Xcode build phase: copy the static web app (kept at the repo root for GitHub Pages)
# into the app bundle as Resources/web. Nothing is duplicated in git.
set -eu
REPO_ROOT="${SRCROOT}/.."
DEST="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/web"

for f in index.html manifest.webmanifest css js icons; do
  if [ ! -e "${REPO_ROOT}/${f}" ]; then
    echo "error: missing web file ${REPO_ROOT}/${f}" >&2
    exit 1
  fi
done

rm -rf "${DEST}"
mkdir -p "${DEST}"
# sw.js, tests and README are intentionally left out (no service worker in the native app).
cp "${REPO_ROOT}/index.html" "${REPO_ROOT}/manifest.webmanifest" "${DEST}/"
cp -R "${REPO_ROOT}/css" "${REPO_ROOT}/js" "${REPO_ROOT}/icons" "${DEST}/"
echo "Copied web app into ${DEST}"
ls -R "${DEST}"
