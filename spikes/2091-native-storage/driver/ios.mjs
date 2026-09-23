import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle, command, confirmStopped } from './control.mjs';
export async function ios(device, simulator) {
  let pid;
  const jsonPath = fileURLToPath(new URL('../.deps/devicectl.json', import.meta.url));
  async function devicectl(args) {
    await rm(jsonPath, { force: true });
    await command('xcrun', ['devicectl', ...args, '--json-output', jsonPath]);
    return JSON.parse(await readFile(jsonPath, 'utf8')).result;
  }
  async function alive() {
    if (!pid) return false;
    if (simulator) { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } }
    const result = await devicectl(['device', 'info', 'processes', '--device', device]);
    return result.runningProcesses.some(p => p.processIdentifier === pid);
  }
  let environment;
  if (simulator) {
    const list = JSON.parse(await command('xcrun', ['simctl', 'list', 'devices', 'available', '--json']));
    const entry = Object.entries(list.devices).flatMap(([runtime, devices]) => devices.map(d => ({ runtime, ...d }))).find(d => d.udid === device);
    if (!entry || entry.state !== 'Booted') throw new Error('Requested iOS simulator is not booted');
    environment = { deviceName: entry.name, os: entry.runtime.replace('com.apple.CoreSimulator.SimRuntime.', '') };
  } else {
    const info = await devicectl(['device', 'info', 'details', '--device', device]);
    environment = { deviceName: info.deviceProperties?.name, os: info.deviceProperties?.osVersionNumber, hardware: info.hardwareProperties };
  }
  return {
    environment, alive, memory: async () => null,
    async launch(origin) {
      if (simulator) {
        const container = await command('xcrun', ['simctl', 'get_app_container', device, bundle, 'data']);
        const documents = join(container, 'Documents');
        await mkdir(documents, { recursive: true });
        await writeFile(join(documents, 'spike2091-driver.txt'), origin);
        const result = await command('xcrun', ['simctl', 'launch', device, bundle]);
        pid = Number(result.match(/:\s*(\d+)\s*$/)?.[1]);
        if (!pid) throw new Error(`No launch PID: ${result}`);
      } else {
        const source = fileURLToPath(new URL('../.deps/spike2091-driver.txt', import.meta.url));
        await writeFile(source, origin);
        try {
          await devicectl(['device', 'copy', 'to', '--device', device, '--domain-type', 'appDataContainer',
            '--domain-identifier', bundle, '--source', source, '--destination', 'Documents/spike2091-driver.txt']);
        } finally {
          await rm(source, { force: true });
        }
        const result = await devicectl(['device', 'process', 'launch', '--device', device, bundle]);
        pid = result.process?.processIdentifier;
        if (!pid) throw new Error(`No launch PID: ${JSON.stringify(result)}`);
      }
    },
    async stop() {
      if (!pid || !await alive()) throw new Error('Harness failure: target exited before requested stop');
      if (simulator) process.kill(pid, 'SIGKILL');
      else await command('xcrun', ['devicectl', 'device', 'process', 'signal', '--device', device, '--pid', String(pid), '--signal', 'SIGKILL']);
      await confirmStopped(alive); pid = undefined;
    },
  };
}
