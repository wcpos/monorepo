import { storeCollections } from '../index';
import { logsLiteral } from './logs';

describe('logs schema', () => {
	it('is version 3 with the category+timestamp index', () => {
		expect(logsLiteral.version).toBe(3);
		expect(logsLiteral.indexes).toEqual([
			['timestamp'],
			['level', 'timestamp'],
			['category', 'timestamp'],
		]);
	});

	it('admits the recovered outcome (issue #899: transient failures that healed)', () => {
		expect(logsLiteral.properties.outcome.enum).toContain('recovered');
	});

	it('migrates v2 rows to v3 unchanged (enum widening only)', () => {
		const migrate = storeCollections.logs.migrationStrategies?.[3];
		expect(migrate).toBeDefined();
		const row = { timestamp: 500, level: 'warn', outcome: 'failed', context: {} };
		expect(migrate?.({ ...row }, {} as never)).toEqual(row);
	});

	it('constrains indexed fields as RxDB requires', () => {
		expect(logsLiteral.properties.level.maxLength).toBe(16);
		expect(logsLiteral.properties.category.maxLength).toBe(64);
		expect(logsLiteral.properties.timestamp).toMatchObject({
			type: 'integer',
			minimum: 0,
			maximum: 100000000000000, // year ~5138, RxDB needs an explicit bound
			multipleOf: 1,
		});
	});

	it.each([
		{
			old: {
				timestamp: 100,
				level: 'success',
				context: { errorCode: 'API01001' },
			},
			expected: {
				level: 'info',
				outcome: 'ok',
				code: 'API01001',
				count: 1,
				firstSeen: 100,
				lastSeen: 100,
			},
		},
		{
			old: { timestamp: 200, level: 'audit', context: {} },
			expected: {
				level: 'info',
				category: 'db.audit',
				count: 1,
				firstSeen: 200,
				lastSeen: 200,
			},
		},
		{
			old: { timestamp: 300, level: 'verbose', context: {} },
			expected: {
				level: 'info',
				count: 1,
				firstSeen: 300,
				lastSeen: 300,
			},
		},
		{
			old: { timestamp: 400, level: null, context: {} },
			expected: {
				level: 'info',
				count: 1,
				firstSeen: 400,
				lastSeen: 400,
			},
		},
	])('migrates a v1 row to v2', ({ old, expected }) => {
		const migrate = storeCollections.logs.migrationStrategies?.[2];
		expect(migrate).toBeDefined();
		expect(migrate?.({ ...old }, {} as never)).toMatchObject(expected);
	});

	it('stamps sizeBytes on migrated rows so retention cannot undercount them (PR #851 review)', () => {
		const migrate = storeCollections.logs.migrationStrategies?.[2];
		const migrated = migrate?.(
			{ timestamp: 100, level: 'info', message: 'x'.repeat(2048), context: {} },
			{} as never
		);
		expect(typeof migrated.sizeBytes).toBe('number');
		expect(migrated.sizeBytes).toBeGreaterThan(2048);
		expect(migrated.sizeBytes).toBe(new TextEncoder().encode(JSON.stringify(migrated)).byteLength);
	});
});
