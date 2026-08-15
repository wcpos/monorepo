import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceRoot = join(__dirname, '..');
const deepImportAllowlist = new Set([
	// Direct schema imports avoid evaluating census.ts while the canonical collection list initializes.
	'collections/engine-collections.ts',
]);

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			return path === __dirname ? [] : sourceFiles(path);
		}
		return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
	});
}

describe('scheduler package seam', () => {
	it('routes imports from outside scheduler through its index', () => {
		const deepImports = sourceFiles(sourceRoot).flatMap((path) => {
			if (deepImportAllowlist.has(relative(sourceRoot, path))) return [];
			const matches = readFileSync(path, 'utf8').match(
				/\b(?:from\s*|import\s*\(\s*)['"][^'"]*scheduler\/[^'"]+['"]/g
			);
			return matches?.map((match) => `${relative(sourceRoot, path)}: ${match}`) ?? [];
		});

		expect(deepImports).toEqual([]);
	});
});
