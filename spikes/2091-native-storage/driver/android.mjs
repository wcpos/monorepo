import { homedir } from 'node:os';
import { bundle, command, confirmStopped } from './control.mjs';
export async function android(device, port = 48091) {
  const adb = homedir() + '/Library/Android/sdk/platform-tools/adb';
  const call = (args, fail = false) => command(adb, ['-s', device, ...args], fail);
  const alive = async () => {
    try { return Boolean(await call(['shell', 'pidof', bundle])); }
    catch (error) {
      // pidof exits 1 and prints nothing when the process is absent. adb's own failures (device
      // offline, unauthorized, not found) also exit 1 but say so on stderr; those are harness
      // failures, never a process death, so a scorer in its opening phase cannot record them as
      // open-failed.
      const stderr = String(error.stderr ?? '').trim();
      if (error.code === 1 && !stderr) return false;
      throw new Error(`Harness failure: device unreachable (adb: ${stderr || error.message})`, { cause: error });
    }
  };
  // USB works for physical devices; reverse avoids depending on their Wi-Fi route.
  await call(['reverse', `tcp:${port}`, `tcp:${port}`]);
  return {
    environment: { deviceName: await call(['shell', 'getprop', 'ro.product.model']), os: await call(['shell', 'getprop', 'ro.build.version.release']),
      emulator: await call(['shell', 'getprop', 'ro.kernel.qemu']) === '1' },
    alive,
    async launch(url) {
      // A docked Pixel dozes between rows; a launch behind the lock screen never becomes visible
      // (the activity shows over the keyguard, see app/with-show-when-locked.js, but only once awake).
      await call(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
      const result = await call(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', url, bundle]);
      if (/Error:/.test(result) || !await alive()) throw new Error(`Android launch failed: ${result}`);
    },
    async stop() {
      if (!await alive()) throw new Error('Harness failure: target exited before requested stop');
      await call(['shell', 'am', 'force-stop', bundle]);
      await confirmStopped(alive);
    },
    async memory() {
      const output = await call(['shell', 'dumpsys', 'meminfo', bundle]);
      const match = output.match(/TOTAL PSS:\s*(\d+)/) ?? output.match(/^\s*TOTAL\s+(\d+)/m);
      if (!match) throw new Error('TOTAL PSS absent from dumpsys meminfo');
      return { totalPssKiB: Number(match[1]) };
    },
  };
}
