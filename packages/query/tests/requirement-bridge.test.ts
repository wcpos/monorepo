import type { EngineRequirement, RequirementHandle } from '@wcpos/sync-engine';

import { declareRequirements } from '../src/requirement-bridge';
import { createEngineDatabase } from '../src/testing';

import type { RxDatabase } from 'rxdb';

describe('declareRequirements', () => {
	let database: RxDatabase;

	beforeEach(async () => {
		database = await createEngineDatabase();
	});

	afterEach(async () => {
		await database.close();
	});

	it('declares requirement objects and swallows search rejections', async () => {
		const searchHandle: RequirementHandle = {
			ready: Promise.reject(new Error('offline')),
			release: jest.fn(),
			queryKey: null,
		};
		const targetedHandle: RequirementHandle = {
			ready: Promise.resolve({
				action: 'serve-local',
				missingRecordIds: [],
				reason: 'stub',
			}),
			release: jest.fn(),
			queryKey: null,
		};
		const engine = {
			require: jest.fn((requirement: EngineRequirement) =>
				requirement.kind === 'search' ? searchHandle : targetedHandle
			),
		};
		const requirements: EngineRequirement[] = [
			{ id: 'a', collection: 'products', kind: 'search', term: 'mug' },
			{
				id: 'b',
				collection: 'products',
				kind: 'targeted-records',
				remoteIds: ['1'],
			},
		];
		const unhandled = jest.fn();
		process.once('unhandledRejection', unhandled);
		try {
			const handles = declareRequirements(engine as never, requirements);
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(handles).toHaveLength(2);
			expect(handles).toEqual([searchHandle, targetedHandle]);
			expect(engine.require.mock.calls.map(([requirement]) => requirement)).toEqual(requirements);
			expect(unhandled).not.toHaveBeenCalled();
			await expect(handles[1].ready).resolves.toMatchObject({
				action: 'serve-local',
			});
		} finally {
			// A failing assertion above must not leak the listener into later tests.
			process.removeListener('unhandledRejection', unhandled);
		}
	});

	it('contains a rejected category refresh without an unhandled rejection', async () => {
		const handle: RequirementHandle = {
			ready: Promise.reject(new Error('offline')),
			release: jest.fn(),
			queryKey: null,
		};
		const engine = { require: jest.fn(() => handle) };
		const unhandled = jest.fn();
		process.once('unhandledRejection', unhandled);
		try {
			declareRequirements(engine as never, [
				{ id: 'category-filter', collection: 'categories', kind: 'refresh' },
			]);
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(unhandled).not.toHaveBeenCalled();
		} finally {
			process.removeListener('unhandledRejection', unhandled);
		}
	});
});
