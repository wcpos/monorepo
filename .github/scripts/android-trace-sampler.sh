#!/bin/sh
# DIAGNOSTIC BRANCH ONLY (monorepo#3345, never merged). Started in the
# background by the Android emulator step of e2e-native.yml; samples host and
# device load into ~/.maestro/tests/trace until the stop-screenrecord sentinel
# appears. Every adb call runs under `timeout 45`; a failed sample logs a line
# to sampler.log and the loop carries on. No `set -e`: nothing here may fail
# the job.
D="$HOME/.maestro/tests/trace"
STOP="$HOME/.maestro/tests/stop-screenrecord"
PKG=com.wcpos.main.dev
mkdir -p "$D" || exit 0
log() { echo "$(date -u +%FT%TZ) $*" >> "$D/sampler.log"; }
log "sampler start pid $$"
next_top=$(date +%s)
next_trace=$((next_top + 120))
n=0
while [ ! -f "$STOP" ]; do
  now=$(date +%s)
  if [ "$now" -ge "$next_top" ]; then
    next_top=$((now + 30))
    {
      echo "===== $(date -u +%FT%TZ)"
      uptime
      top -b -n 1 -o %CPU -w 200 | head -n 19
      echo "----- device top -H"
      timeout 45 adb shell top -H -b -n 1 -m 25 || log "device top failed (exit $?)"
    } >> "$D/top.log" 2>&1
  fi
  if [ "$now" -ge "$next_trace" ]; then
    next_trace=$((now + 300))
    n=$((n + 1))
    f="/data/misc/perfetto-traces/t-$n.perfetto-trace"
    log "perfetto $n start"
    timeout 45 adb shell perfetto -o "$f" -t 20s sched freq gfx view dalvik am wm binder_driver >> "$D/perfetto.log" 2>&1 || log "perfetto $n capture failed (exit $?)"
    timeout 45 adb pull "$f" "$D/t-$n.perfetto-trace" >> "$D/perfetto.log" 2>&1 || log "perfetto $n pull failed (exit $?)"
    timeout 45 adb shell rm -f "$f" >/dev/null 2>&1 || log "perfetto $n rm failed (exit $?)"
    timeout 45 adb shell dumpsys gfxinfo "$PKG" framestats > "$D/gfxinfo-$n.txt" 2>&1 || log "gfxinfo $n failed (exit $?)"
    log "perfetto $n done"
  fi
  sleep 5
done
log "sampler stop (sentinel)"
