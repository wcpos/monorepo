import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const tempDir = mkdtempSync(join(tmpdir(), 'sync-packages-publish-'));

function run(command, args, { cwd = repoRoot, print = true } = {}) {
	const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
	if (result.error) throw result.error;
	if (print) {
		process.stdout.write(result.stdout);
		process.stderr.write(result.stderr);
	}
	assert.equal(result.status, 0, `${command} ${args.join(' ')} failed`);
	return result.stdout;
}

try {
	run('pnpm', ['--filter', '@wcpos/sync-core', 'build']);
	run('pnpm', ['--filter', '@wcpos/sync-engine', 'build']);
	const tarballs = [];
	const coreVersion = JSON.parse(readFileSync(join(repoRoot, 'packages/sync-core/package.json'), 'utf8')).version;
	for (const name of ['sync-core', 'sync-engine']) {
		const packageDir = join(repoRoot, 'packages', name);
		const source = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
		const packDir = join(tempDir, name);
		mkdirSync(packDir);
		run('pnpm', ['pack', '--pack-destination', packDir], { cwd: packageDir });
		const packedFiles = readdirSync(packDir).filter((file) => file.endsWith('.tgz'));
		assert.equal(packedFiles.length, 1, `Expected one ${name} tarball`);
		const tarball = join(packDir, packedFiles[0]);
		tarballs.push(tarball);
		const entries = run('tar', ['-tzf', tarball], { print: false }).trim().split('\n');
		const required = ['package.json', 'dist/src/index.js', 'dist/src/index.d.ts', 'dist/src/testing.js', 'dist/src/testing.d.ts'];
		if (name === 'sync-core') {
			required.push(...['responses', 'order-money-oracle'].map((file) => `dist/contracts/write-contract/fixtures/${file}.json`));
		}
		for (const file of required) assert.ok(entries.includes(`package/${file}`), `${name}: missing ${file}`);
		assert.ok(!entries.some((file) => file.startsWith('package/src/')), `${name}: contains src/`);
		assert.ok(!entries.some((file) => file.includes('.test.')), `${name}: contains test files`);
		const packed = JSON.parse(run('tar', ['-xOf', tarball, 'package/package.json'], { print: false }));
		assert.ok(!Object.hasOwn(packed, 'private'));
		assert.ok(!JSON.stringify(packed).includes('workspace:'));
		assert.equal(packed.version, source.version);
		assert.equal(packed.main, 'dist/src/index.js');
		assert.equal(packed.types, 'dist/src/index.d.ts');
		for (const [entry, file] of [['.', 'index'], ['./testing', 'testing']]) {
			assert.deepEqual(packed.exports[entry], {
				types: `./dist/src/${file}.d.ts`, default: `./dist/src/${file}.js`,
			});
		}
		assert.equal(packed.publishConfig.registry, 'https://npm.pkg.github.com');
		// devDependencies are never installed by consumers; the tests still use @wcpos/utils.
		for (const key of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
			assert.ok(!Object.hasOwn(packed[key] ?? {}, '@wcpos/utils'), `${name}: ${key} has @wcpos/utils`);
		}
		if (name === 'sync-core') {
			assert.equal(Object.keys(packed.dependencies ?? {}).length, 0);
		} else {
			assert.equal(packed.dependencies['@wcpos/sync-core'], coreVersion);
			assert.deepEqual(packed.peerDependencies, { rxdb: '17.4.0', 'rxdb-premium': '17.4.0' });
			assert.equal(packed.peerDependenciesMeta['rxdb-premium'].optional, true);
		}
		for (const file of entries.filter((entry) => entry.endsWith('.js'))) {
			const emitted = run('tar', ['-xOf', tarball, file], { print: false });
			assert.ok(
				!/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]@wcpos\/utils/.test(emitted),
				`${name}: ${file} imports @wcpos/utils`
			);
		}
	}
	const scratch = join(tempDir, 'scratch');
	mkdirSync(scratch);
	writeFileSync(join(scratch, 'package.json'), JSON.stringify({ name: 'sync-packages-smoke', private: true, type: 'module' }));
	run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', ...tarballs, 'rxdb@17.4.0'], { cwd: scratch });
	writeFileSync(join(scratch, 'smoke.mjs'), `
import assert from 'node:assert/strict';
import { scopeDatabaseName } from '@wcpos/sync-core';
import { createFakePullServer, createFakeWriteServer } from '@wcpos/sync-core/testing';
import { createRxdbSyncEngine, setSyncEngineLogger } from '@wcpos/sync-engine';
import { createEngineHarness } from '@wcpos/sync-engine/testing';
for (const fn of [scopeDatabaseName, createFakePullServer, createFakeWriteServer,
	createRxdbSyncEngine, setSyncEngineLogger, createEngineHarness]) {
	assert.equal(typeof fn, 'function');
}
const harness = await createEngineHarness({ mode: 'manual' });
let timer;
try {
	const report = await Promise.race([
		harness.engine.sync(),
		new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error('sync() timed out after 60 s')), 60_000);
		}),
	]);
	assert.ok(report !== null && typeof report === 'object');
	console.log('sync report keys:', Object.keys(report));
} finally {
	clearTimeout(timer);
	await harness.dispose();
}
`);
	run('node', ['smoke.mjs'], { cwd: scratch });
	writeFileSync(join(scratch, 'smoke.ts'), `
import { createRxdbSyncEngine } from '@wcpos/sync-engine';
import { createEngineHarness } from '@wcpos/sync-engine/testing';
import { scopeDatabaseName } from '@wcpos/sync-core';
import { createFakePullServer } from '@wcpos/sync-core/testing';
type IsAny<T> = 0 extends 1 & T ? true : false;
type Ports = Parameters<typeof createRxdbSyncEngine>[0];
export const checks: [false, false, false, false, false, false] = [
	false as IsAny<Ports>,
	false as IsAny<Ports['site']>,
	false as IsAny<ReturnType<typeof createRxdbSyncEngine>>,
	false as IsAny<Awaited<ReturnType<typeof createEngineHarness>>>,
	false as IsAny<typeof scopeDatabaseName>,
	false as IsAny<ReturnType<typeof createFakePullServer>>,
];
`);
	run(join(repoRoot, 'node_modules/.bin/tsc'), [
		'--noEmit', '--strict', '--skipLibCheck', '--module', 'nodenext',
		'--moduleResolution', 'nodenext', '--target', 'es2022', 'smoke.ts',
	], { cwd: scratch });
	console.log(`check-sync-packages-publish: ok ${tarballs[0]} ${tarballs[1]}`);
} finally {
	rmSync(tempDir, { recursive: true, force: true });
}
