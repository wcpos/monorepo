import { homedir } from 'node:os';
import { bundle, command, confirmStopped } from './control.mjs';
export async function android(device) {
  const adb = homedir() + '/Library/Android/sdk/platform-tools/adb';
  const call = (args, fail = false) => command(adb, ['-s', device, ...args], fail);
  const alive = async () => Boolean(await call(['shell', 'pidof', bundle], true));
  // USB works for physical devices; reverse avoids depending on their Wi-Fi route.
  await call(['reverse', 'tcp:48091', 'tcp:48091']);
  return {
    environment: { deviceName: await call(['shell', 'getprop', 'ro.product.model']), os: await call(['shell', 'getprop', 'ro.build.version.release']),
      emulator: await call(['shell', 'getprop', 'ro.kernel.qemu']) === '1' },
    alive,
    async launch(url) {
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
