import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import * as collectionCreators from './index';

it('starts every app collection and schema at version 0 without migration strategies', async () => {
	for (const collections of Object.values(collectionCreators)) {
		for (const creator of Object.values(collections)) {
			expect(creator).not.toHaveProperty('migrationStrategies');
			expect(creator.schema.version).toBe(0);
		}
	}

	for (const file of readdirSync(join(__dirname, 'schemas'))) {
		if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
		const exports: Record<string, unknown> = await import(`./schemas/${file}`);
		for (const schema of Object.values(exports)) {
			if (schema && typeof schema === 'object' && 'version' in schema) {
				expect({ file, version: schema.version }).toEqual({ file, version: 0 });
			}
		}
	}
});
