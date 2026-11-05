#!/bin/zsh
# Builds build/MyDaysBar.app (release, ad-hoc signed). Pass --install to copy it to /Applications.
set -euo pipefail
cd "$(dirname "$0")/.."

swift build -c release --product MyDaysBar
swift build -c release --product mydays-collect
bin="$(swift build -c release --show-bin-path)"

app=build/MyDaysBar.app
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp Resources/Info.plist "$app/Contents/Info.plist"
cp "$bin/MyDaysBar" "$app/Contents/MacOS/MyDaysBar"
cp "$bin/mydays-collect" "$app/Contents/Resources/mydays-collect"
codesign --force --sign - "$app/Contents/Resources/mydays-collect"
codesign --force --sign - "$app"
echo "built $app"

if [[ "${1:-}" == "--install" ]]; then
  pkill -x MyDaysBar 2>/dev/null || true
  rm -rf /Applications/MyDaysBar.app
  cp -R "$app" /Applications/
  open /Applications/MyDaysBar.app
  echo "installed /Applications/MyDaysBar.app"
fi
