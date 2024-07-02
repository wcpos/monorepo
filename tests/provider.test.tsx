import * as React from 'react';

import { render, cleanup } from '@testing-library/react';

import httpClientMock from './__mocks__/http';
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

	afterEach(() => {
		jest.clearAllMocks();
		storeDatabase.remove();
		syncDatabase.remove();
		cleanup();
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

	it('should create and retrieve a query instance', () => {
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

			const paramsPromise = new Promise((resolve) => {
				const paramsSubscription = query?.params$.subscribe((params) => {
					resolve(params);
					paramsSubscription?.unsubscribe();
				});
			});

			const dataPromise = new Promise((resolve) => {
				const querySubscription = query?.result$.subscribe((data) => {
					resolve(data);
					querySubscription?.unsubscribe();
				});
			});

			Promise.all([paramsPromise, dataPromise]).then(([params, data]) => {
				try {
					expect(params).toEqual({}); // Expect params to be an empty object
					expect(data).toEqual([]); // Expect data to be an empty array
					done();
				} catch (error) {
					done(error);
				}
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
