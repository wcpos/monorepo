import { describe, expect, it } from 'vitest';

type Glob = (
	pattern: string,
	options: { query: string; import: string; eager: true }
) => Record<string, string>;
declare global {
	interface ImportMeta {
		glob: Glob;
	}
}

describe('RxDB bulk write result guard', () => {
	it('forbids raw unchecked bulk writes in sync-core and sync-engine', () => {
		const modules = {
			...import.meta.glob('../../sync-core/src/**/*.ts', {
				query: '?raw',
				import: 'default',
				eager: true,
			}),
			...import.meta.glob('../../sync-engine/src/**/*.ts', {
				query: '?raw',
				import: 'default',
				eager: true,
			}),
		};
		// An empty glob silently scans nothing — pin a floor so a package rename
		// (this happened when sync-engine-rxdb landed here as sync-engine) can
		// never turn the guard into a vacuous pass.
		expect(Object.keys(modules).length).toBeGreaterThan(150);
		const offenders: string[] = [];
		for (const [path, source] of Object.entries(modules)) {
			if (path.endsWith('.test.ts') || path.endsWith('/assertBulkSuccess.ts')) continue;
			const lines = source.split('\n');
			lines.forEach((line, index) => {
				if (!/\.bulk(?:Insert|Upsert|Remove|Write)\s*\(/.test(line)) return;
				// Prettier may split `assertBulkSuccess(await x.bulkY(...))` across
				// lines; accept the wrapper on the match line or the two above it.
				const window = lines.slice(Math.max(0, index - 2), index + 1).join('\n');
				if (!window.includes('assertBulkSuccess(')) {
					offenders.push(`${path}:${index + 1}`);
				}
			});
		}
		expect(offenders, offenders.join('\n')).toEqual([]);
	});
});
