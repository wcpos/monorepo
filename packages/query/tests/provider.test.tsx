import * as React from 'react';

import { render, cleanup } from '@testing-library/react';

import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase, createSyncDatabase } from './helpers/db';
import { QueryProvider, useQueryManager } from '../src/provider';
import { useQuery } from '../src/use-query';

import type { RxDatabase } from 'rxdb';

// Mock the logger module
jest.mock('@wcpos/utils/src/logger');

describe('QueryProvider', () => {
	let storeDatabase: RxDatabase;
	let syncDatabase: RxDatabase;

	beforeEach(async () => {
		storeDatabase = await createStoreDatabase();
		syncDatabase = await createSyncDatabase();
	});

	afterEach(async () => {
		await storeDatabase.destroy();
		await syncDatabase.destroy();
		cleanup();
		jest.clearAllMocks();
	});

	it('should provide a Manager instance', () => {
		const TestComponent = () => {
			const manager = useQueryManager();
			expect(manager).toBeDefined();
			return <div>Test</div>;
		};

		render(
			<QueryProvider
				localDB={storeDatabase}
				fastLocalDB={syncDatabase}
				http={httpClientMock}
				locale=""
			>
				<TestComponent />
			</QueryProvider>
		);
	});

	it('should create and retrieve a query instance', async () => {
		// TestComponent1 uses useQuery to create a query
		const TestComponent1 = () => {
			const query = useQuery({ queryKeys: ['myQuery'], collectionName: 'products' });
			expect(query).toBeDefined();
			return <div />;
		};

		// TestComponent2 attempts to retrieve the same query
		const TestComponent2 = () => {
			const manager = useQueryManager();
			const query = manager.getQuery(['myQuery']);
			expect(query).toBeDefined();
			return <div />;
		};

		render(
			<QueryProvider
				localDB={storeDatabase}
				fastLocalDB={syncDatabase}
				http={httpClientMock}
				locale=""
			>
				<TestComponent1 />
				<TestComponent2 />
			</QueryProvider>
		);
	});

	it('should have initial values for query.params$ and query.result$', (done) => {
		const TestComponent = () => {
			const query = useQuery({ queryKeys: ['myQuery'], collectionName: 'products' });

			query.params$.subscribe((params) => {
				expect(params).toEqual({});
			});

			query.result$.subscribe((result) => {
				expect(result).toEqual(
					expect.objectContaining({
						searchActive: false,
						hits: [],
						count: 0,
					})
				);
				done();
			});

			return <div />;
		};

		render(
			<QueryProvider
				localDB={storeDatabase}
				fastLocalDB={syncDatabase}
				http={httpClientMock}
				locale=""
			>
				<TestComponent />
			</QueryProvider>
		);
	});
});
