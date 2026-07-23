import { logsLiteral } from './logs';

describe('logs schema', () => {
	it('is version 1 with timestamp and level+timestamp indexes', () => {
		expect(logsLiteral.version).toBe(1);
		expect(logsLiteral.indexes).toEqual([['timestamp'], ['level', 'timestamp']]);
	});
	it('constrains indexed fields as RxDB requires', () => {
		expect(logsLiteral.properties.level.maxLength).toBe(16);
		expect(logsLiteral.properties.timestamp).toMatchObject({
			type: 'integer',
			minimum: 0,
			maximum: 100000000000000, // year ~5138, RxDB needs an explicit bound
			multipleOf: 1,
		});
	});
});
