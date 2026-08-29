#!/usr/bin/env bash

set -euo pipefail

usage() {
	cat <<'EOF'
usage: e2e-native-local.sh [--platform ios|android] [--device phone|tablet] [--flow <path>] [--no-video]
EOF
}

die() {
	echo "Error: $*" >&2
	exit 1
}

PLATFORM=ios
DEVICE_CLASS=phone
FLOW_PATH=apps/main/.maestro
FLOW_WAS_SET=0
RECORD_VIDEO=1

while [ "$#" -gt 0 ]; do
	case "$1" in
		--platform)
			[ "$#" -ge 2 ] || { usage >&2; die "--platform requires ios or android."; }
			PLATFORM=$2
			shift 2
			;;
		--device)
			[ "$#" -ge 2 ] || { usage >&2; die "--device requires phone or tablet."; }
			DEVICE_CLASS=$2
			shift 2
			;;
		--flow)
			[ "$#" -ge 2 ] || { usage >&2; die "--flow requires a path."; }
			FLOW_PATH=$2
			FLOW_WAS_SET=1
			shift 2
			;;
		--no-video)
			RECORD_VIDEO=0
			shift
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			usage >&2
			die "unknown argument: $1"
			;;
	esac
done

case "$PLATFORM" in ios|android) ;; *) die "--platform must be ios or android." ;; esac
case "$DEVICE_CLASS" in phone|tablet) ;; *) die "--device must be phone or tablet." ;; esac

REPO_ROOT=$(CDPATH='' cd "$(dirname "$0")/.." && pwd)
cd "$REPO_ROOT"
[ -e "$FLOW_PATH" ] || die "flow path does not exist: $FLOW_PATH"

METRO_STATUS=$(curl -fsS http://localhost:8081/status 2>/dev/null || true)
case "$METRO_STATUS" in
	*packager-status:running*) ;;
	*)
		die "Metro is not running at http://localhost:8081/status. Run 'npx expo start --no-dev --minify' in apps/main, then retry."
		;;
esac

if [ "$PLATFORM" = ios ]; then
	command -v xcrun >/dev/null 2>&1 || die "xcrun is not available. Install Xcode and boot an iOS Simulator."
	BOOTED_DEVICES=$(xcrun simctl list devices booted)
	DEVICE_FAMILY=iPhone
	[ "$DEVICE_CLASS" = phone ] || DEVICE_FAMILY=iPad
	DEVICE_ID=$(printf '%s\n' "$BOOTED_DEVICES" | sed -n "/$DEVICE_FAMILY/ s/.*(\([0-9A-Fa-f-]\{36\}\)) (Booted).*/\1/p" | head -n 1)
	[ -n "$DEVICE_ID" ] || die "No booted iOS $DEVICE_CLASS simulator found. Boot an $DEVICE_FAMILY simulator, then retry."
else
	command -v adb >/dev/null 2>&1 || die "adb is not available. Install Android platform-tools and start an emulator."
	ADB_DEVICES=$(adb devices)
	DEVICE_ID=$(printf '%s\n' "$ADB_DEVICES" | awk 'NR > 1 && $2 == "device" { print $1; exit }')
	[ -n "$DEVICE_ID" ] || die "No running Android emulator found. Start one, confirm it appears in 'adb devices', then retry."
	echo "Android requires Metro port forwarding; running: adb -s $DEVICE_ID reverse tcp:8081 tcp:8081"
	adb -s "$DEVICE_ID" reverse tcp:8081 tcp:8081 || die "adb reverse failed. Run 'adb -s $DEVICE_ID reverse tcp:8081 tcp:8081' and retry."
fi
echo "Using $PLATFORM device: $DEVICE_ID ($DEVICE_CLASS)"

command -v maestro >/dev/null 2>&1 || die "maestro is not on PATH. Install Maestro, ensure 'maestro' is available, then retry."

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
RUN_DIR="$REPO_ROOT/.e2e-local/${TIMESTAMP}-$$"
DEBUG_DIR="$RUN_DIR/maestro-debug"
CONSOLE_LOG="$RUN_DIR/app-console.log"
SUITE_LOG="$RUN_DIR/maestro.log"
VIDEO_PATH="$RUN_DIR/screen.mp4"
mkdir -p "$DEBUG_DIR"
: > "$CONSOLE_LOG"
: > "$SUITE_LOG"

VARIABLE_PRODUCT_ID='.*'
if [ -n "${E2E_PRODUCT_WRITER_USER:-}" ] && [ -n "${E2E_PRODUCT_WRITER_PASS:-}" ]; then
	SEED_OUTPUT="$RUN_DIR/seed-output"
	: > "$SEED_OUTPUT"
	GITHUB_OUTPUT="$SEED_OUTPUT" node scripts/e2e-native-seed.mjs
	VARIABLE_PRODUCT_ID=$(sed -n 's/^variable_product_id=//p' "$SEED_OUTPUT" | tail -n 1)
	[ -n "$VARIABLE_PRODUCT_ID" ] || die "Seed completed without printing a variable product id; inspect $SEED_OUTPUT."
	echo "Using seeded variable product id: $VARIABLE_PRODUCT_ID"
else
	echo "Warning: E2E_PRODUCT_WRITER_USER and E2E_PRODUCT_WRITER_PASS are not both set; flows needing seeded fixtures will fail. Continuing with VARIABLE_PRODUCT_ID=\".*\"." >&2
fi

LOG_PID=''
VIDEO_PID=''
REMOTE_VIDEO="/sdcard/wcpos-e2e-local-$$.mp4"
stop_capture() {
	set +e
	if [ -n "$VIDEO_PID" ]; then
		if [ "$PLATFORM" = ios ]; then
			kill -INT "$VIDEO_PID" 2>/dev/null
		else
			SCREENRECORD_PID=$(adb -s "$DEVICE_ID" shell pidof screenrecord 2>/dev/null | awk '{ print $1 }')
			[ -z "$SCREENRECORD_PID" ] || adb -s "$DEVICE_ID" shell kill -2 "$SCREENRECORD_PID" >/dev/null 2>&1
		fi
		wait "$VIDEO_PID" 2>/dev/null
		VIDEO_PID=''
	fi
	if [ -n "$LOG_PID" ]; then
		kill "$LOG_PID" 2>/dev/null
		wait "$LOG_PID" 2>/dev/null
		LOG_PID=''
	fi
}
trap stop_capture EXIT INT TERM

if [ "$PLATFORM" = ios ]; then
	xcrun simctl spawn "$DEVICE_ID" log stream --style compact --level info --predicate 'processImagePath CONTAINS "WCPOS"' > "$CONSOLE_LOG" 2>&1 &
	LOG_PID=$!
	if [ "$RECORD_VIDEO" -eq 1 ]; then
		xcrun simctl io "$DEVICE_ID" recordVideo --codec h264 --force "$VIDEO_PATH" > "$RUN_DIR/video-capture.log" 2>&1 &
		VIDEO_PID=$!
	fi
else
	adb -s "$DEVICE_ID" logcat -c || die "adb logcat clear failed."
	adb -s "$DEVICE_ID" logcat -v threadtime > "$CONSOLE_LOG" 2>&1 &
	LOG_PID=$!
	if [ "$RECORD_VIDEO" -eq 1 ]; then
		echo "Android screenrecord is limited to about 3 minutes; screen.mp4 will contain only the first segment."
		( adb -s "$DEVICE_ID" shell screenrecord --time-limit 180 "$REMOTE_VIDEO" >/dev/null 2>&1 || true
		  adb -s "$DEVICE_ID" pull "$REMOTE_VIDEO" "$VIDEO_PATH" >/dev/null 2>&1 || true
		  adb -s "$DEVICE_ID" shell rm -f "$REMOTE_VIDEO" >/dev/null 2>&1 || true ) &
		VIDEO_PID=$!
	fi
fi

export MAESTRO_DRIVER_STARTUP_TIMEOUT=240000
run_maestro() {
	maestro --udid "$DEVICE_ID" test --debug-output "$DEBUG_DIR" \
		-e VARIABLE_PRODUCT_ID="$VARIABLE_PRODUCT_ID" -e DEVICE_CLASS="$DEVICE_CLASS" "$1" 2>&1 | tee -a "$SUITE_LOG"
}

MAESTRO_STATUS=0
if [ "$PLATFORM" = ios ] && [ "$FLOW_WAS_SET" -eq 0 ]; then
	for flow in apps/main/.maestro/flows/*.yml; do
		echo "▶ $flow" | tee -a "$SUITE_LOG"
		if run_maestro "$flow"; then :; else MAESTRO_STATUS=$?; break; fi
	done
else
	if run_maestro "$FLOW_PATH"; then :; else MAESTRO_STATUS=$?; fi
fi

stop_capture
trap - EXIT INT TERM

echo
echo "=== App errors (shown first because overlays can mask Maestro targets) ==="
APP_ERRORS=$(sed -n -e 's/^.*ERROR : /ERROR : /p' -e '/ERROR : /!s/^.*console\.error: /console.error: /p' "$CONSOLE_LOG")
if [ -n "$APP_ERRORS" ]; then printf '%s\n' "$APP_ERRORS"; else echo "No ERROR : or console.error: lines found."; fi
echo
echo "=== Maestro flow results ==="
# Only a whole-directory run prints [Passed]/[Failed] per flow; a single-flow
# invocation prints its steps and nothing else. Fall back to the exit status
# rather than printing "no results" for a run that plainly had one.
if grep -aE '\[(Passed|Failed)\]' "$SUITE_LOG"; then
	:
elif [ "$MAESTRO_STATUS" -eq 0 ]; then
	echo "PASSED (single flow: $FLOW_PATH)"
else
	echo "FAILED (single flow: $FLOW_PATH) — maestro exit $MAESTRO_STATUS"
	grep -aE 'FAILED|Assertion is false' "$SUITE_LOG" | tail -5 || true
fi
echo
echo "=== Artifacts ==="
if [ "$RECORD_VIDEO" -eq 1 ]; then echo "Video: $VIDEO_PATH"; else echo "Video: disabled (--no-video)"; fi
echo "Console log: $CONSOLE_LOG"
echo "Maestro debug output: $DEBUG_DIR"

exit "$MAESTRO_STATUS"
