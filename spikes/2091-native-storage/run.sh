#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
case "${1:-}" in
  install) node install.mjs ;;
  prebuild)
    cd app
    npx --no-install expo prebuild --clean --no-install
    printf 'sdk.dir=%s/Library/Android/sdk\n' "$HOME" > android/local.properties
    cd ios; LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install ;;
  build)
    target="${2:?build ios-sim|ios-device|android <device>}"; device="${3:?device required}"
    cd app
    case "$target" in
      ios-sim|ios-device)
        args=(-workspace ios/wcposspike2091.xcworkspace -scheme wcposspike2091 -configuration Release -destination "id=$device" -derivedDataPath .build/ios)
        if [ "$target" = ios-sim ]; then args+=(-sdk iphonesimulator CODE_SIGNING_ALLOWED=NO); else args+=(-allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM=G7L8G4KJ7A CODE_SIGN_STYLE=Automatic); fi
        xcodebuild "${args[@]}" build
        if [ "$target" = ios-sim ]; then xcrun simctl install "$device" .build/ios/Build/Products/Release-iphonesimulator/wcposspike2091.app
        else xcrun devicectl device install app --device "$device" .build/ios/Build/Products/Release-iphoneos/wcposspike2091.app; fi ;;
      android) (cd android; ./gradlew assembleRelease); "$HOME/Library/Android/sdk/platform-tools/adb" -s "$device" install -r android/app/build/outputs/apk/release/app-release.apk ;;
      *) echo 'Unknown build target' >&2; exit 1 ;;
    esac ;;
  smoke|bench|crash) command="$1"; shift; node driver/driver.mjs "$command" "$@" ;;
  report) node report.mjs ;;
  *) echo 'Usage: run.sh install|prebuild|build <target> <device>|smoke|bench|crash|report' >&2; exit 1 ;;
esac
