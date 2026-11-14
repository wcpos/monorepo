import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import * as collectionCreators from './index';

// The next bump is a deliberate act, not an accidental same-version schema edit.
const PINNED: Record<string, number> = { stores: 1 };

it('pins every app collection and schema version and its migration strategies', async () => {
	for (const collections of Object.values(collectionCreators)) {
		for (const [name, creator] of Object.entries(collections)) {
			const version = PINNED[name] ?? 0;
			expect(creator.schema.version).toBe(version);
			if (version === 0) expect(creator).not.toHaveProperty('migrationStrategies');
			else
				expect(Object.keys(creator.migrationStrategies!)).toEqual(
					Array.from({ length: version }, (_, i) => String(i + 1))
				);
		}
	}

	for (const file of readdirSync(join(__dirname, 'schemas'))) {
		if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
		const exports: Record<string, unknown> = await import(`./schemas/${file}`);
		for (const schema of Object.values(exports)) {
			if (schema && typeof schema === 'object' && 'version' in schema) {
				expect({ file, version: schema.version }).toEqual({
					file,
					version: PINNED[file.slice(0, -3)] ?? 0,
				});
			}
		}
	}
});
