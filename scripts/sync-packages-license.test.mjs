import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootLicense = readFileSync(path.join(ROOT, 'LICENSE'));

for (const packageName of ['sync-core', 'sync-engine']) {
	test(`${packageName} includes the repository MIT license`, () => {
		const packageDir = path.join(ROOT, 'packages', packageName);
		const licensePath = path.join(packageDir, 'LICENSE');
		assert.ok(existsSync(licensePath), `${packageName} LICENSE is missing`);
		assert.deepEqual(readFileSync(licensePath), rootLicense);
		const packageJson = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
		assert.equal(packageJson.license, 'MIT');
	});
}

test('sync-engine includes the optional, separately licensed premium peer notice', () => {
	const packageDir = path.join(ROOT, 'packages', 'sync-engine');
	const noticePath = path.join(packageDir, 'NOTICE');
	assert.ok(existsSync(noticePath), 'sync-engine NOTICE is missing');
	const notice = readFileSync(noticePath, 'utf8');
	assert.match(notice, /rxdb-premium/);
	assert.match(notice, /NOT included/);
	const packageJson = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
	assert.ok(packageJson.files.includes('NOTICE'));
	assert.ok(Object.hasOwn(packageJson.peerDependencies, 'rxdb-premium'));
	assert.equal(packageJson.peerDependenciesMeta['rxdb-premium'].optional, true);
	assert.ok(!Object.hasOwn(packageJson.dependencies, 'rxdb-premium'));
});
