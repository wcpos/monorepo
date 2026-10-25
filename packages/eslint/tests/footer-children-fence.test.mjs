/**
 * Burn-down: PR 2 of the footer-slots work migrates every allowlisted footer to the slot props, then removes `children` from both footers and this scanner with it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { prContext, readBlob, readEvent } from '../../../scripts/check-test-removal.mjs';
import { countSites, ROOT, scanRepository, scanSource } from './footer-children-scanner.mjs';
import { ratchetErrors } from './uniwind-scanner.mjs';

const allowlist = JSON.parse(
	readFileSync(`${ROOT}/packages/eslint/footer-children-allowlist.json`, 'utf8')
);
const sites = scanRepository();
const base = readEvent(prContext()?.eventPath)?.pull_request?.base?.sha ?? 'HEAD';
const prior = readBlob(base, 'packages/eslint/footer-children-allowlist.json', ROOT);
const baseline = prior
	? JSON.parse(prior)
	: countSites(
			Object.keys(allowlist).flatMap((path) => scanSource(readBlob(base, path, ROOT), path))
		);
const path = 'packages/core/src/new-file.tsx';

test('footer children match the shrinking allowlist exactly', () => {
	assert.deepEqual(ratchetErrors(sites, allowlist, baseline), []);
});
test('a footer containing a Button in a new file is a violation', () => {
	for (const name of ['DialogFooter', 'AlertDialogFooter']) {
		const live = scanSource(`<${name}><Button/></${name}>`, path);
		assert.deepEqual(live, [`${path}:1:1:footer-children`]);
		assert.deepEqual(ratchetErrors(live, {}), [
			`New violation: ${path}:footer-children (1 > 0) at lines 1`,
		]);
	}
});
test('slot-only and whitespace-only footers are not sites', () => {
	assert.deepEqual(scanSource('<DialogFooter intent={{ label: "Send" }} />', path), []);
	assert.deepEqual(scanSource('<DialogFooter> \n </DialogFooter>', path), []);
});

test('children attributes and spreads are sites on self-closing footers', () => {
	for (const name of ['DialogFooter', 'AlertDialogFooter']) {
		for (const props of ['children={<Button/>}', '{...p}']) {
			assert.deepEqual(scanSource(`<${name} ${props} />`, path), [`${path}:1:1:footer-children`]);
		}
	}
});
test('buttons nested in aside are footer-aside-button sites in either form', () => {
	for (const footer of ['DialogFooter', 'AlertDialogFooter']) {
		for (const button of [
			'Button',
			'IconButton',
			'Pressable',
			'DialogClose',
			'DialogAction',
			'AlertDialogAction',
			'AlertDialogCancel',
		]) {
			for (const end of ['/>', `></${footer}>`]) {
				assert.deepEqual(
					scanSource(`<${footer} aside={<View><${button}/></View>} close ${end}`, path),
					[`${path}:1:1:footer-aside-button`]
				);
			}
		}
	}
	assert.deepEqual(scanSource('<DialogFooter aside={<Button/>} close />', path), [
		`${path}:1:1:footer-aside-button`,
	]);
});
test('non-button asides and comment-only children are not sites', () => {
	assert.deepEqual(scanSource('<DialogFooter aside={<Text>3 rates</Text>} close />', path), []);
	assert.deepEqual(scanSource('<DialogFooter>{/* soon */}</DialogFooter>', path), []);
});
