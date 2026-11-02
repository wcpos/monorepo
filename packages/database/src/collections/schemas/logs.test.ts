import { checkSchema } from 'rxdb/plugins/dev-mode';

import { logsLiteral } from './logs';

describe('logs schema', () => {
	it('is version 0 with category+timestamp and level+lastSeen indexes', () => {
		expect(logsLiteral.version).toBe(0);
		expect(logsLiteral.indexes).toEqual([
			['timestamp'],
			['level', 'timestamp'],
			['category', 'timestamp'],
			['level', 'lastSeen'],
		]);
	});

	it('admits the recovered outcome (issue #899: transient failures that healed)', () => {
		expect(logsLiteral.properties.outcome.enum).toContain('recovered');
	});

	it('constrains indexed fields as RxDB requires', () => {
		expect(() => checkSchema(logsLiteral)).not.toThrow();
		expect(logsLiteral.properties.lastSeen).toMatchObject({
			type: 'integer',
			minimum: 0,
			maximum: 100000000000000,
			multipleOf: 1,
		});
		expect(logsLiteral.properties.level.maxLength).toBe(16);
		expect(logsLiteral.properties.category.maxLength).toBe(64);
		expect(logsLiteral.properties.timestamp).toMatchObject({
			type: 'integer',
			minimum: 0,
			maximum: 100000000000000, // year ~5138, RxDB needs an explicit bound
			multipleOf: 1,
		});
	});
});
