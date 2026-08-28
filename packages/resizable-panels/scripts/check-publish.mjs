import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const packDir = mkdtempSync(join(tmpdir(), 'react-native-resizable-panels-pack-'));

function run(command, args, { print = true } = {}) {
	const result = spawnSync(command, args, { cwd: packageDir, encoding: 'utf8' });
	if (print) {
		process.stdout.write(result.stdout);
		process.stderr.write(result.stderr);
	}
	if (result.error) throw result.error;
	assert.equal(result.status, 0, `${command} ${args.join(' ')} failed`);
	return result.stdout;
}

try {
	run('pnpm', ['pack', '--pack-destination', packDir]);
	const tarballs = readdirSync(packDir).filter((file) => file.endsWith('.tgz'));
	assert.equal(tarballs.length, 1, `Expected one tarball, found ${tarballs.length}`);

	const tarball = join(packDir, tarballs[0]);
	const entries = run('tar', ['-tzf', tarball])
		.trim()
		.split('\n');

	const requiredFiles = [
		'dist/index.js',
		'dist/index.d.ts',
		'dist/hooks/useSeparatorA11y.web.js',
		'dist/utils/pointerPrecision.web.js',
		'README.md',
		'LICENSE',
	];
	for (const file of requiredFiles) {
		assert.ok(entries.includes(`package/${file}`), `Tarball is missing ${file}`);
	}

	assert.ok(!entries.some((file) => file.startsWith('package/src/')), 'Tarball contains src/');
	assert.ok(
		!entries.some((file) => /(?:^|\/)(?:test|__mocks__)(?:\/|$)|(?:mock|test-utils)/i.test(file)),
		'Tarball contains test doubles'
	);
	assert.ok(!entries.some((file) => /\.test\.[^/]+$/i.test(file)), 'Tarball contains test files');

	const packedPackageJson = JSON.parse(
		run('tar', ['-xOf', tarball, 'package/package.json'], { print: false })
	);
	assert.equal(packedPackageJson.name, 'react-native-resizable-panels');
	assert.equal(packedPackageJson.main, 'dist/index.js');

	const dependencyNames = Object.entries(packedPackageJson)
		.filter(([key, value]) => key.endsWith('Dependencies') && typeof value === 'object')
		.flatMap(([, dependencies]) => Object.keys(dependencies));
	assert.ok(
		!dependencyNames.some((name) => name.startsWith('@wcpos/')),
		'Packed package.json contains an @wcpos/* dependency'
	);
	assert.ok(
		!JSON.stringify(packedPackageJson).includes('workspace:'),
		'Packed package.json contains a workspace: specifier'
	);

	const emitted = run('tar', ['-xOf', tarball, ...entries.filter((f) => f.endsWith('.js'))], { print: false });
	assert.ok(!emitted.includes('@wcpos/'), 'Emitted code imports a @wcpos/* package');

	console.log(`check-publish: ${tarballs[0]} is ready to publish.`);
} finally {
	rmSync(packDir, { recursive: true, force: true });
}
