import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { sweepLogRetention } from './retention';

import type { RxDatabase } from 'rxdb';

const DAY = 86_400_000;
const NOW = 40 * DAY;
const MIB = 1024 * 1024;
type Row = { logId: string; timestamp: number; sizeBytes?: number; message?: string };
let database: RxDatabase;
let sequence = 0;

async function seed(rows: Row[]) {
	database = await createRxDatabase({
		name: `retention${Date.now()}${sequence++}`,
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
	const { logs } = await database.addCollections<{ logs: Row }>({
		logs: {
			schema: {
				version: 0,
				primaryKey: 'logId',
				type: 'object',
				properties: {
					logId: { type: 'string', maxLength: 64 },
					timestamp: { type: 'integer', minimum: 0, maximum: 1e15, multipleOf: 1 },
					sizeBytes: { type: 'integer', minimum: 0 },
					message: { type: 'string' },
				},
				required: ['logId', 'timestamp'],
				indexes: ['timestamp'],
			},
		},
	});
	expect((await logs.bulkInsert(rows)).error).toEqual([]);
	return logs;
}

afterEach(async () => {
	await database?.remove();
});

describe('retention against real RxDB storage', () => {
	it('does not materialize the entire history in one storage response', async () => {
		const logs = await seed(
			Array.from({ length: 1201 }, (_, i) => ({
				logId: String(i).padStart(5, '0'),
				timestamp: NOW,
				sizeBytes: 100,
			}))
		);
		const query = logs.storageInstance.query.bind(logs.storageInstance);
		let largestResponse = 0;
		jest.spyOn(logs.storageInstance, 'query').mockImplementation(async (prepared) => {
			const result = await query(prepared);
			largestResponse = Math.max(largestResponse, result.documents.length);
			return result;
		});

		await sweepLogRetention(logs, NOW);

		expect(largestResponse).toBeGreaterThan(0);
		expect(largestResponse).toBeLessThanOrEqual(500);
		expect(await logs.count().exec()).toBe(1201);
	});

	it('keeps exactly the newest 25 MiB across equal-timestamp page boundaries', async () => {
		const logs = await seed(
			Array.from({ length: 1201 }, (_, i) => ({
				logId: String(i).padStart(5, '0'),
				timestamp: NOW,
				sizeBytes: MIB / 32,
			}))
		);

		await sweepLogRetention(logs, NOW);

		const remaining = await logs.find({ sort: [{ logId: 'asc' }] }).exec();
		expect(remaining).toHaveLength(800);
		expect(remaining[0].primary).toBe('00401');
		expect(remaining[799].primary).toBe('01200');
	});

	it('removes expired pages without skipping records after deletion', async () => {
		const logs = await seed([
			...Array.from({ length: 1101 }, (_, i) => ({
				logId: String(i).padStart(5, '0'),
				timestamp: 9 * DAY,
				sizeBytes: 100,
			})),
			{ logId: 'boundary', timestamp: 10 * DAY, sizeBytes: 100 },
			{ logId: 'recent', timestamp: NOW, sizeBytes: 100 },
		]);

		await sweepLogRetention(logs, NOW);

		expect((await logs.find().exec()).map((row) => row.primary).sort()).toEqual([
			'boundary',
			'recent',
		]);
	});

	it('measures legacy rows without charging RxDB internal metadata', async () => {
		const legacy = { logId: 'legacy', timestamp: NOW, message: 'λ' };
		const legacyBytes = new TextEncoder().encode(JSON.stringify(legacy)).byteLength;
		const logs = await seed([
			legacy,
			{ logId: 'newest', timestamp: NOW + 1, sizeBytes: 25 * MIB - legacyBytes },
		]);

		await sweepLogRetention(logs, NOW);

		expect(await logs.count().exec()).toBe(2);
	});
});
