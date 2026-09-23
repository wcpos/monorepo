import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import { generateSheet, loadMotion, sheetPath } from './generate-motion-tokens.mjs';

test('committed sheet equals generated motion tokens', () => {
	const sheet = readFileSync(sheetPath, 'utf8');
	assert.equal(sheet, generateSheet(sheet), 'Run node scripts/generate-motion-tokens.mjs');
});

test('waiting-path beats stay in budget and only functional waits are exempt', () => {
	const { BEATS } = loadMotion();
	assert.equal(Object.keys(BEATS).length, 23);
	assert.deepEqual(
		Object.entries(BEATS)
			.filter(([, beat]) => beat.exempt)
			.map(([key]) => key),
		['spinner', 'indeterminateProgress', 'holdToVoid']
	);
	for (const beat of Object.values(BEATS)) {
		if (beat.waitingPath && !beat.exempt) {
			assert.ok(beat.duration + (beat.step ?? 0) * ((beat.cap ?? 1) - 1) <= 400, beat.name);
		}
	}
});

test('web reduce-motion zeroes motion but excludes the two functional waits', () => {
	const sheet = readFileSync(sheetPath, 'utf8');
	const dom = new JSDOM(`<style>${sheet.slice(sheet.lastIndexOf('@supports'))}</style>`);
	const document = dom.window.document;
	const guard = document.styleSheets[0].cssRules[0];
	assert.equal(guard.conditionText, 'selector(div > div)');
	const media = guard.cssRules[0];
	assert.equal(media.conditionText, '(prefers-reduced-motion: reduce)');
	const rule = media.cssRules[0];
	const selector = rule.selectorText.split(',')[0];
	const element = document.createElement('div');
	for (const name of ['web:animate-in', 'web:animate-spin', 'web:animate-indeterminate']) {
		element.className = name;
		assert.equal(element.matches(selector), name === 'web:animate-in');
	}
	for (const property of [
		'animation-duration',
		'animation-delay',
		'transition-duration',
		'transition-delay',
	]) {
		assert.equal(rule.style.getPropertyValue(property), '0ms');
		assert.equal(rule.style.getPropertyPriority(property), 'important');
	}
	dom.window.close();
});

test('the sheet defines the progress sweep animation and keyframes', () => {
	const sheet = readFileSync(sheetPath, 'utf8');
	assert.match(sheet, /--animate-indeterminate:/);
	assert.match(sheet, /@keyframes indeterminate/);
});

test('the sheet defines the popover drop animations and keyframes', () => {
	const sheet = readFileSync(sheetPath, 'utf8');
	for (const name of ['pop-in', 'pop-out']) {
		assert.ok(sheet.includes(`--animate-${name}:`));
		assert.ok(sheet.includes(`@keyframes ${name}`));
	}
});
