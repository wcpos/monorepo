import { readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
const app = fileURLToPath(new URL('app/', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const token = parseEnv(readFileSync(root + '.env', 'utf8')).RXDB_PREMIUM;
if (!token) throw new Error('RXDB_PREMIUM missing in worktree root .env');
function run(command, args, secret = false) {
  const r = spawnSync(command, args, { cwd: app, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: secret ? { ...process.env, RXDB_PREMIUM: token } : process.env });
  // Premium's installer logs its token. Never forward even successful installer output.
  if (!secret || r.status !== 0) process.stdout.write(((r.stdout ?? '') + (r.stderr ?? '')).split(token).join('[REDACTED]').replace(/accessToken: .*/g, 'accessToken: [REDACTED]'));
  if (r.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${r.status}: ${r.error ?? ''}`);
}
run('npm', ['install']);
run('node', ['node_modules/rxdb-premium/scripts/postinstall.js'], true);
run('node', ['node_modules/rxdb-premium/scripts/installer.js'], true);
const destination = app + 'node_modules/rxdb-premium/dist';
rmSync(destination, { recursive: true, force: true });
run('cp', ['-RL', root + 'node_modules/rxdb-premium/dist', destination]);
const patchDir = destination + '/esm/plugins/storage-abstract-filesystem/';
const markers = readdirSync(patchDir).reduce((sum, file) => sum + readFileSync(patchDir + file, 'utf8').split('\n').filter(l => l.includes('__wcpos')).length, 0);
const REQUIRED_MARKERS = 47; // Same seven installed patches in every row, per brief.
if (markers !== REQUIRED_MARKERS) throw new Error(`Premium marker count ${markers}, expected ${REQUIRED_MARKERS}`);
run('npx', ['--no-install', 'patch-package', '--error-on-fail']);
run('npm', ['ls', 'rxdb', 'rxjs']);
const packages = ['expo','react-native','expo-sqlite','expo-file-system','expo-opfs','rxdb','rxdb-premium','rxjs','react-native-worklets'];
const versions = Object.fromEntries(packages.map(name => [name, JSON.parse(readFileSync(app + `node_modules/${name}/package.json`)).version]));
const helper = readFileSync(app + 'node_modules/rxdb/dist/esm/plugins/storage-sqlite/sqlite-helpers.js', 'utf8');
writeFileSync(app + 'src/versions.json', JSON.stringify({ ...versions, premiumMarkers: markers, expoOpfsShippedPatch: true, beginRetryConsoleDir: helper.includes('console.dir(') }, null, 2) + '\n');
console.info(`Installed: premium markers=${markers}; BEGIN helper console.dir=${helper.includes('console.dir(')}`);
