import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = new URL('./extract-js-strings.js', import.meta.url).pathname;

function writeFixtureFile(root, relativePath, contents) {
	const filePath = join(root, relativePath);
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, contents);
}

test('--check fails when source uses keys missing from the English catalog', () => {
	const root = mkdtempSync(join(tmpdir(), 'wcpos-translations-check-'));

	writeFixtureFile(
		root,
		'packages/core/src/contexts/translations/locales/en/core.json',
		JSON.stringify({ 'existing.key': 'Existing copy' }, null, '\t')
	);
	writeFixtureFile(
		root,
		'packages/core/src/example.tsx',
		`
      const title = t('existing.key', 'Existing copy');
      const body = t('missing.key', 'Missing copy');
    `
	);

	const result = spawnSync(process.execPath, [scriptPath, root, '--check'], {
		encoding: 'utf8',
	});

	assert.notEqual(result.status, 0);
	assert.match(`${result.stdout}\n${result.stderr}`, /missing\.key/);
});

test('--check ignores translation calls inside source comments', () => {
	const root = mkdtempSync(join(tmpdir(), 'wcpos-translations-comments-'));

	writeFixtureFile(
		root,
		'packages/core/src/contexts/translations/locales/en/core.json',
		JSON.stringify({ 'existing.key': 'Existing copy' }, null, '\t')
	);
	writeFixtureFile(
		root,
		'packages/core/src/example.tsx',
		`
      const title = t('existing.key', 'Existing copy');
      // const body = t('missing.line_comment', 'Missing copy');
      /*
       * const footer = t('missing.block_comment', 'Missing copy');
       */
    `
	);

	const result = spawnSync(process.execPath, [scriptPath, root, '--check'], {
		encoding: 'utf8',
	});

	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('--check sees the footer count key as a literal call', () => {
	const footerPaths = [
		'packages/core/src/screens/main/components/data-table/footer.tsx',
		'packages/core/src/screens/main/tax-rates/footer.tsx',
	];

	for (const footerPath of footerPaths) {
		const root = mkdtempSync(join(tmpdir(), 'wcpos-translations-footer-'));

		writeFixtureFile(
			root,
			'packages/core/src/contexts/translations/locales/en/core.json',
			JSON.stringify({}, null, '\t')
		);
		writeFixtureFile(
			root,
			footerPath,
			readFileSync(new URL(`../${footerPath}`, import.meta.url), 'utf8')
		);

		const result = spawnSync(process.execPath, [scriptPath, root, '--check'], {
			encoding: 'utf8',
		});
		const output = `${result.stdout}\n${result.stderr}`;

		assert.notEqual(result.status, 0, `${footerPath}\n${output}`);
		// Both footers render exactly one count string: the `N+` at-least variant was
		// retired so every locale converges on one "Showing…" phrasing. The trailing
		// quote keeps this anchored to the whole key, so a future `common.showing_of_*`
		// cannot satisfy it by prefix.
		assert.match(output, /common\.showing_of"/, footerPath);
	}
});

test('--check sees every attention-reason key as a literal call', () => {
	const root = mkdtempSync(join(tmpdir(), 'wcpos-translations-attention-'));
	const attentionPath = 'packages/core/src/screens/main/health/attention-panel.tsx';

	writeFixtureFile(
		root,
		'packages/core/src/contexts/translations/locales/en/core.json',
		JSON.stringify({}, null, '\t')
	);
	writeFixtureFile(
		root,
		attentionPath,
		readFileSync(new URL(`../${attentionPath}`, import.meta.url), 'utf8')
	);

	const result = spawnSync(process.execPath, [scriptPath, root, '--check'], {
		encoding: 'utf8',
	});
	const output = `${result.stdout}\n${result.stderr}`;

	assert.notEqual(result.status, 0, output);
	assert.match(output, /health\.database\.attention_reason"/);
	assert.match(output, /health\.database\.attention_reason_pull"/);
	assert.match(output, /health\.database\.attention_reason_delete"/);
});
