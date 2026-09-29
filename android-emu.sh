#!/usr/bin/env bash
# Android emulator helper for this Codespace (VS Code terminal).
# Usage: ./android-emu.sh start|status|screenshot|install <apk>|stop|bootwait
set -e
export ANDROID_SDK_ROOT=$HOME/Android/Sdk
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$HOME/Android/Sdk/platform-tools:$HOME/Android/Sdk/emulator:$PATH

AVD=pixel30
case "${1:-status}" in
  start)
    sudo chmod 666 /dev/kvm 2>/dev/null || true
    adb start-server
    if adb devices | grep -q "emulator-"; then echo "already running"; exit 0; fi
    rm -f $HOME/emulator.log
    setsid emulator -avd $AVD -no-window -no-audio -no-boot-anim \
      -gpu swiftshader_indirect -memory 1536 -cores 2 \
      -no-snapshot -no-metrics > $HOME/emulator.log 2>&1 < /dev/null &
    echo "started pid $! log=\$HOME/emulator.log"
    ;;
  status)
    adb devices -l
    adb shell getprop sys.boot_completed 2>&1 || true
    ;;
  bootwait)
    for i in $(seq 1 15); do
      B=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r ' || true)
      echo "try$i boot_completed=$B"
      [ "$B" = "1" ] && exit 0
      sleep 20
    done
    echo "not booted yet"; exit 1
    ;;
  screenshot)
    OUT=${2:-$HOME/screen.png}
    adb exec-out screencap -p > "$OUT"
    echo "saved $OUT"; ls -lh "$OUT"
    ;;
  install)
    APK=$2
    [ -z "$APK" ] && { echo "usage: $0 install <file.apk>"; exit 1; }
    adb install -r "$APK"
    ;;
  stop)
    adb emu kill 2>/dev/null || true
    echo stopped
    ;;
esac
