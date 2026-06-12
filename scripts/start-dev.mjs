import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Starts the apps/main Metro dev server from a guaranteed-clean state.
 *
 * With Metro lazy bundling, a running app holds a module-ID map tied to the
 * Metro instance that built its main bundle. Restarting Metro (or changing
 * the dependency graph) renumbers module IDs, and an already-running app that
 * then triggers a dynamic import() fails with "Requiring unknown module <N>".
 *
 * This script makes that impossible:
 * 1. Kills whatever owns the Metro port, so there is exactly one Metro.
 * 2. Force-quits the dev-client app on all booted iOS simulators and
 *    connected Android devices, so no stale app can reconnect.
 * 3. Starts Metro with EXPO_NO_METRO_LAZY=1, which inlines dynamic imports
 *    into the main bundle — no split bundles exist to go stale.
 *
 * Usage: pnpm start [extra expo start args]
 * Respects EXPO_PORT (defaults to 8081).
 */

const PORT = process.env.EXPO_PORT || '8081';
const IOS_BUNDLE_ID = 'com.wcpos.main.dev';
const ANDROID_PACKAGE = 'com.wcpos.main.dev';
const APP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'main');

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

// 1. Kill anything holding the Metro port (graceful, then hard).
const pids = run('lsof', ['-ti', `:${PORT}`]).split('\n').filter(Boolean);
if (pids.length > 0) {
  console.log(`[start-dev] killing stale Metro on port ${PORT} (pid ${pids.join(', ')})`);
  run('kill', pids);
  const stillAlive = () => run('lsof', ['-ti', `:${PORT}`]).split('\n').filter(Boolean);
  const deadline = Date.now() + 3000;
  while (stillAlive().length > 0 && Date.now() < deadline) {
    execFileSync('sleep', ['0.2']);
  }
  const survivors = stillAlive();
  if (survivors.length > 0) {
    console.log(`[start-dev] force-killing pid ${survivors.join(', ')}`);
    run('kill', ['-9', ...survivors]);
  }
}

// 2. Force-quit the app on all booted iOS simulators.
const simctlJson = run('xcrun', ['simctl', 'list', 'devices', 'booted', '-j']);
if (simctlJson) {
  try {
    const booted = Object.values(JSON.parse(simctlJson).devices)
      .flat()
      .filter((device) => device.state === 'Booted');
    for (const device of booted) {
      run('xcrun', ['simctl', 'terminate', device.udid, IOS_BUNDLE_ID]);
      console.log(`[start-dev] terminated ${IOS_BUNDLE_ID} on ${device.name}`);
    }
  } catch {
    // simctl output unparsable — nothing to terminate
  }
}

// 3. Force-quit the app on all connected Android devices/emulators.
const adbDevices = run('adb', ['devices'])
  .split('\n')
  .slice(1)
  .map((line) => line.split('\t'))
  .filter(([, state]) => state === 'device')
  .map(([serial]) => serial);
for (const serial of adbDevices) {
  run('adb', ['-s', serial, 'shell', 'am', 'force-stop', ANDROID_PACKAGE]);
  console.log(`[start-dev] force-stopped ${ANDROID_PACKAGE} on ${serial}`);
}

// 4. Start Metro in the foreground with lazy bundling disabled.
console.log(`[start-dev] starting Metro on port ${PORT} (lazy bundling disabled)`);
const child = spawn('npx', ['expo', 'start', '--port', PORT, ...process.argv.slice(2)], {
  cwd: APP_DIR,
  stdio: 'inherit',
  env: { ...process.env, EXPO_NO_METRO_LAZY: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
