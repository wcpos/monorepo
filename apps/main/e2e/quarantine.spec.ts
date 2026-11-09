// Bare Playwright `test`, so no page opens; the gate lets a throwaway list exercise its modes.
import { test as base, expect } from '@playwright/test';

import {
	quarantineAction,
	quarantineEntry,
	type QuarantineEntry,
	quarantineGate,
} from './quarantine';

const test = base.extend<{ quarantineGate: void }>({ quarantineGate });

const ENTRY: QuarantineEntry = {
	project: 'pro-authenticated',
	file: 'checkout-device.spec.ts',
	title: 'POS device capture › approve',
	group: 'G2',
};

const testInfo = (project: string, title: string, file = 'checkout-device.spec.ts') => ({
	project: { name: project },
	titlePath: [file, 'POS device capture', title],
});

test('finds the entry for a matching project, file and title', () => {
	expect(quarantineEntry(testInfo('pro-authenticated', 'approve'), [ENTRY])).toBe(ENTRY);
});

test('does not match the same test in a different project', () => {
	expect(quarantineEntry(testInfo('free-authenticated', 'approve'), [ENTRY])).toBeUndefined();
});

test('does not match a different title in the same file', () => {
	expect(quarantineEntry(testInfo('pro-authenticated', 'decline'), [ENTRY])).toBeUndefined();
});

test('matches the path relative to testDir, not the basename', () => {
	const nested = testInfo('pro-authenticated', 'approve', 'nested/checkout-device.spec.ts');
	expect(quarantineEntry(nested, [ENTRY])).toBeUndefined();
});

const TRUNK = { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' };
const PR = { GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/3450/merge' };
const TRUNK_ONLY: QuarantineEntry = { ...ENTRY, group: 'G8', trunkOnly: true };

test('a trunkOnly entry is fixme on the trunk run', () => {
	expect(quarantineAction(TRUNK_ONLY, TRUNK)).toBe('fixme');
});

test('a trunkOnly entry runs on a pull-request run', () => {
	expect(quarantineAction(TRUNK_ONLY, PR)).toBe('run');
});

test('a trunkOnly entry runs on a push to any other branch and off CI', () => {
	expect(quarantineAction(TRUNK_ONLY, { ...TRUNK, GITHUB_REF: 'refs/heads/1.11.x' })).toBe('run');
	expect(quarantineAction(TRUNK_ONLY, {})).toBe('run');
});

test('a plain entry is fixme on both the trunk run and a pull-request run', () => {
	expect(quarantineAction(ENTRY, TRUNK)).toBe('fixme');
	expect(quarantineAction(ENTRY, PR)).toBe('fixme');
});

test('an unlisted test runs on both', () => {
	expect(quarantineAction(undefined, TRUNK)).toBe('run');
	expect(quarantineAction(undefined, PR)).toBe('run');
});

test('E2E_QUARANTINE=only runs every listed entry, trunkOnly included, and skips the rest', () => {
	const only = { ...PR, GITHUB_EVENT_NAME: 'schedule', E2E_QUARANTINE: 'only' };
	expect(quarantineAction(TRUNK_ONLY, only)).toBe('run');
	expect(quarantineAction(ENTRY, only)).toBe('run');
	expect(quarantineAction(undefined, only)).toBe('skip');
});
