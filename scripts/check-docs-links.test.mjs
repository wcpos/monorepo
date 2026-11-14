import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	docsPath,
	extractDocsLinks,
	findBadLinks,
	loadRoutes,
	missingErrorCodePages,
} from './check-docs-links.mjs';

describe('loadRoutes', () => {
	it('trims paths and ignores blank lines and comments', () => {
		assert.deepStrictEqual(
			loadRoutes(' # Routes\n\n /hardware/scanners/setup-wizard \r\n/error-codes\n/error-codes\n'),
			new Set(['/hardware/scanners/setup-wizard', '/error-codes'])
		);
	});
});

describe('docsPath', () => {
	for (const [suffix, expected] of [
		['/hardware/scanners/setup-wizard#test-panel', '/hardware/scanners/setup-wizard'],
		['/support/?from=app#help', '/support'],
		['/support#help?from=app', '/support'],
		['/support/', '/support'],
		['', '/'],
		['/', '/'],
		['?from=app#help', '/'],
	]) {
		it(`normalizes ${suffix || 'the bare host'}`, () => {
			assert.equal(docsPath(`https://docs.wcpos.com${suffix}`), expected);
		});
	}
});

describe('extractDocsLinks', () => {
	it('finds single, double and backtick links and stops at interpolation', () => {
		const source = [
			"'https://docs.wcpos.com/support'",
			'"https://docs.wcpos.com/hardware/scanners/setup-wizard#test-panel"',
			'`https://docs.wcpos.com/error-codes/${code}`',
			'`https://docs.wcpos.com/support/?from=app&x=A_Z-1.2~%20#help`',
			'(https://docs.wcpos.com) https://docs.wcpos.com/support text',
		].join('\n');
		assert.deepStrictEqual(extractDocsLinks(source), [
			'https://docs.wcpos.com/support',
			'https://docs.wcpos.com/hardware/scanners/setup-wizard#test-panel',
			'https://docs.wcpos.com/error-codes/',
			'https://docs.wcpos.com/support/?from=app&x=A_Z-1.2~%20#help',
			'https://docs.wcpos.com',
			'https://docs.wcpos.com/support',
		]);
		assert.deepStrictEqual(extractDocsLinks('no docs links'), []);
	});
});

describe('findBadLinks', () => {
	it('rejects the old wizard path and accepts the new path with its anchor', (t) => {
		const directory = mkdtempSync(path.join(tmpdir(), 'wcpos-docs-links-'));
		t.after(() => rmSync(directory, { recursive: true, force: true }));
		const oldUrl = 'https://docs.wcpos.com/hardware/scanner-setup-wizard';
		writeFileSync(path.join(directory, 'old.ts'), `const url = '${oldUrl}';`);
		writeFileSync(
			path.join(directory, 'new.ts'),
			"const url = 'https://docs.wcpos.com/hardware/scanners/setup-wizard#test-panel';"
		);
		writeFileSync(path.join(directory, 'root.ts'), "const url = 'https://docs.wcpos.com/';");
		assert.deepStrictEqual(
			findBadLinks({
				files: ['old.ts', 'new.ts', 'root.ts'],
				routes: new Set(['/hardware/scanners/setup-wizard']),
				readFile: (file) => readFileSync(path.join(directory, file), 'utf8'),
			}),
			[{ file: 'old.ts', url: oldUrl }]
		);
	});
});

describe('missingErrorCodePages', () => {
	it('reports codes without a page', () => {
		assert.deepStrictEqual(
			missingErrorCodePages({
				codes: ['SYNC203', 'SYNC999'],
				routes: new Set(['/error-codes', '/error-codes/SYNC203']),
			}),
			['SYNC999']
		);
	});
});

describe('main', () => {
	it('passes both checks against the repository', () => {
		const script = fileURLToPath(new URL('./check-docs-links.mjs', import.meta.url));
		const output = execFileSync(process.execPath, [script], { encoding: 'utf8' });
		assert.match(output, /^docs links OK: \d+ links in \d+ files, \d+ error codes\n$/);
	});
});
