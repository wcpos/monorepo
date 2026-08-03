import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import registry from './event-registry.json';
import {
	EVENT_LABELS,
	isSyncEventType,
	SYNC_EVENT_TYPES,
} from './generated/event-labels.generated';

const DOMAINS = ['AUTH', 'SYNC', 'CHECKOUT', 'PAYMENT', 'PRINT', 'PRODUCT', 'LICENSE', 'CLIENT'];
const REQUIRED_FIELDS = ['type', 'domain', 'label', 'introducedIn'];

const repoRoot = path.resolve(__dirname, '../../../..');
const generator = path.join(repoRoot, 'scripts/generate-event-labels.mjs');
const catalogueDirectory = path.join(__dirname, 'generated');
const titlesDirectory = path.join(repoRoot, 'packages/core/src/screens/main/logs/generated');
const localePath = path.join(
	repoRoot,
	'packages/core/src/contexts/translations/locales/en/core.json'
);

function runGenerator(outputDirectory: string, registryPath?: string): void {
	const args = [generator, '--output-dir', outputDirectory];
	if (registryPath) args.push('--registry', registryPath);
	execFileSync(process.execPath, args);
}

describe('event registry', () => {
	it('has complete, unique, sorted entries', () => {
		const types = new Set<string>();
		let previous = '';

		for (const entry of registry) {
			for (const field of REQUIRED_FIELDS) {
				expect(entry[field as keyof typeof entry]).toBeTruthy();
			}
			expect(DOMAINS).toContain(entry.domain);
			expect(entry.type).toMatch(/^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)+$/);
			expect(types.has(entry.type)).toBe(false);
			expect(entry.type >= previous).toBe(true);
			types.add(entry.type);
			previous = entry.type;
		}
	});

	/**
	 * These labels are the only thing a merchant sees in the Logs ledger, so they
	 * are held to the copy bar the rest of the health screens keep: a short,
	 * calm statement — never the dotted code, never a shouted sentence.
	 */
	it('labels read as plain merchant-facing copy', () => {
		for (const entry of registry) {
			expect(entry.label).not.toContain(entry.type);
			expect(entry.label).not.toMatch(/[a-z]\.[a-z-]+\./);
			expect(entry.label).not.toMatch(/[.!]$/);
			expect(entry.label.length).toBeLessThanOrEqual(70);
			expect(entry.label[0]).toBe(entry.label[0].toUpperCase());
		}
	});

	it('exposes every registered type through the generated catalogue', () => {
		expect([...SYNC_EVENT_TYPES].sort()).toEqual(registry.map(({ type }) => type).sort());
		for (const entry of registry) {
			const generated = EVENT_LABELS[entry.type as keyof typeof EVENT_LABELS];
			expect(generated.label).toBe(entry.label);
			expect(generated.key).toBe(`health.logs.event.${entry.type.replace(/[.-]/g, '_')}`);
		}
	});

	it('narrows only registered types, so unknown codes keep their raw fallback', () => {
		expect(isSyncEventType('queue.scheduler.drain')).toBe(true);
		expect(isSyncEventType('checkout.settled')).toBe(false);
		expect(isSyncEventType(undefined)).toBe(false);
	});

	it('regenerates byte-identical checked-in artifacts', () => {
		const outputDirectory = mkdtempSync(path.join(tmpdir(), 'wcpos-event-labels-'));
		try {
			runGenerator(outputDirectory);
			expect(readFileSync(path.join(outputDirectory, 'event-labels.generated.ts'), 'utf8')).toBe(
				readFileSync(path.join(catalogueDirectory, 'event-labels.generated.ts'), 'utf8')
			);
			expect(readFileSync(path.join(outputDirectory, 'event-titles.generated.ts'), 'utf8')).toBe(
				readFileSync(path.join(titlesDirectory, 'event-titles.generated.ts'), 'utf8')
			);
			// The generator owns the health.logs.event.* block of the English
			// catalogue, so a label edited in the registry cannot go un-shipped.
			expect(readFileSync(path.join(outputDirectory, 'core.json'), 'utf8')).toBe(
				readFileSync(localePath, 'utf8')
			);
		} finally {
			rmSync(outputDirectory, { recursive: true, force: true });
		}
	});

	it('exits non-zero when registry validation fails', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'wcpos-event-labels-invalid-'));
		const invalidRegistry = path.join(directory, 'registry.json');
		writeFileSync(invalidRegistry, JSON.stringify([...registry, registry[0]]));

		try {
			expect(() => runGenerator(directory, invalidRegistry)).toThrow();
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('translates every registered type with a literal, extractable t() call', () => {
		const source = readFileSync(path.join(titlesDirectory, 'event-titles.generated.ts'), 'utf8');

		for (const entry of registry) {
			const key = `health.logs.event.${entry.type.replace(/[.-]/g, '_')}`;
			expect(source).toContain(`case '${entry.type}':`);
			expect(source).toContain(`t('${key}');`);
		}
		// No `defaultValue` fallbacks: English is bundled and is the fallback
		// language, so a copy here would be a third, drift-prone one.
		expect(source).not.toContain('defaultValue:');
	});

	it('is the only source of the English strings those keys resolve to', () => {
		const locale = JSON.parse(readFileSync(localePath, 'utf8')) as Record<string, string>;
		const shipped = Object.keys(locale).filter((key) => key.startsWith('health.logs.event.'));

		expect(shipped).toEqual(
			registry.map(({ type }) => `health.logs.event.${type.replace(/[.-]/g, '_')}`)
		);
		for (const entry of registry) {
			expect(locale[`health.logs.event.${entry.type.replace(/[.-]/g, '_')}`]).toBe(entry.label);
		}
	});
});
