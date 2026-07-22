import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { syncSubmoduleGitlinks } from './stage-submodule-bumps.mjs';

const GIT_ENV = {
	...process.env,
	GIT_CONFIG_GLOBAL: '/dev/null',
	GIT_CONFIG_SYSTEM: '/dev/null',
	GIT_AUTHOR_NAME: 'test',
	GIT_AUTHOR_EMAIL: 'test@example.com',
	GIT_COMMITTER_NAME: 'test',
	GIT_COMMITTER_EMAIL: 'test@example.com',
	GIT_ALLOW_PROTOCOL: 'file',
};

function git(cwd, ...args) {
	return execFileSync('git', ['-c', 'protocol.file.allow=always', ...args], {
		cwd,
		env: GIT_ENV,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

const quiet = { log: () => {}, warn: () => {} };

/**
 * Builds a superproject with a submodule at apps/electron pinned to commit B,
 * where the submodule history is A -> B -> C on main and A -> D on a side
 * branch (so C is a fast-forward of B, A is backwards, D is sideways).
 */
function makeFixture(t) {
	const root = mkdtempSync(join(tmpdir(), 'stage-submodule-test-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));

	const subOrigin = join(root, 'sub-origin');
	git(root, 'init', '-b', 'main', 'sub-origin');
	const commit = (msg) => {
		writeFileSync(join(subOrigin, 'file.txt'), msg);
		git(subOrigin, 'add', '.');
		git(subOrigin, 'commit', '-m', msg);
		return git(subOrigin, 'rev-parse', 'HEAD');
	};
	const A = commit('A');
	const B = commit('B');
	const C = commit('C');
	git(subOrigin, 'checkout', '-b', 'side', A);
	const D = commit('D');
	git(subOrigin, 'checkout', 'main');

	const superRepo = join(root, 'super');
	git(root, 'init', '-b', 'main', 'super');
	writeFileSync(join(superRepo, 'README.md'), 'super');
	git(superRepo, 'add', '.');
	git(superRepo, 'commit', '-m', 'init');
	git(superRepo, 'submodule', 'add', subOrigin, 'apps/electron');
	const subPath = join(superRepo, 'apps', 'electron');
	git(subPath, 'fetch', 'origin', 'side');
	git(subPath, 'checkout', B);
	git(superRepo, 'add', 'apps/electron');
	git(superRepo, 'commit', '-m', 'pin submodule to B');

	return { superRepo, subPath, A, B, C, D };
}

const stagedGitlink = (superRepo) => git(superRepo, 'rev-parse', ':apps/electron');
const run = (superRepo) => syncSubmoduleGitlinks({ repoRoot: superRepo, paths: ['apps/electron'], ...quiet });

test('stages the gitlink when the checkout is a descendant of the committed pointer', (t) => {
	const { superRepo, subPath, C } = makeFixture(t);
	git(subPath, 'checkout', C);

	const [result] = run(superRepo);

	assert.equal(result.action, 'staged');
	assert.equal(stagedGitlink(superRepo), C);
});

test('does not stage a checkout that is behind the committed pointer', (t) => {
	const { superRepo, subPath, A, B } = makeFixture(t);
	git(subPath, 'checkout', A);

	const [result] = run(superRepo);

	assert.equal(result.action, 'blocked');
	assert.equal(result.detail, 'non-descendant');
	assert.equal(stagedGitlink(superRepo), B, 'index must keep the committed pointer');
});

test('does not stage a checkout that has diverged sideways from the committed pointer', (t) => {
	const { superRepo, subPath, B, D } = makeFixture(t);
	git(subPath, 'checkout', D);

	const [result] = run(superRepo);

	assert.equal(result.action, 'blocked');
	assert.equal(result.detail, 'non-descendant');
	assert.equal(stagedGitlink(superRepo), B);
});

test('does nothing when the checkout matches the committed pointer', (t) => {
	const { superRepo, B } = makeFixture(t);

	const [result] = run(superRepo);

	assert.equal(result.action, 'unchanged');
	assert.equal(stagedGitlink(superRepo), B);
});

test('respects an explicitly staged non-descendant gitlink', (t) => {
	const { superRepo, subPath, A } = makeFixture(t);
	git(subPath, 'checkout', A);
	git(superRepo, 'add', 'apps/electron');

	const [result] = run(superRepo);

	assert.equal(result.action, 'kept-explicit-stage');
	assert.equal(stagedGitlink(superRepo), A, 'explicit backwards stage must survive');
});

test('skips submodules that are not initialized', (t) => {
	const { superRepo, B } = makeFixture(t);
	git(superRepo, 'submodule', 'deinit', '-f', 'apps/electron');

	const [result] = run(superRepo);

	assert.equal(result.action, 'uninitialized');
	assert.equal(stagedGitlink(superRepo), B);
});

test('blocks when the committed pointer is missing from the local submodule clone', (t) => {
	const { superRepo, subPath, B, C } = makeFixture(t);
	const bogus = '0123456789abcdef0123456789abcdef01234567';
	git(superRepo, 'update-index', '--cacheinfo', `160000,${bogus},apps/electron`);
	git(superRepo, 'commit', '-m', 'pin submodule to unknown commit');
	git(subPath, 'checkout', C);

	const [result] = run(superRepo);

	assert.equal(result.action, 'blocked');
	assert.equal(result.detail, 'unknown-ancestry');
	assert.equal(stagedGitlink(superRepo), bogus);
});

test('reports a path with no committed gitlink and requires an explicit stage', (t) => {
	const { superRepo, B } = makeFixture(t);
	git(superRepo, 'rm', '--cached', 'apps/electron');
	git(superRepo, 'commit', '-m', 'drop gitlink');

	const [result] = run(superRepo);

	assert.equal(result.action, 'needs-explicit-stage');
});
