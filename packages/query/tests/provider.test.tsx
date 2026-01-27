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
		if (storeDatabase && !storeDatabase.destroyed) {
			await storeDatabase.remove();
		}
		if (syncDatabase && !syncDatabase.destroyed) {
			await syncDatabase.remove();
		}
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

	it('should have initial values for query.rxQuery$ and query.result$', (done) => {
		const TestComponent = () => {
			const query = useQuery({ queryKeys: ['myQuery'], collectionName: 'products' });

			// Query has rxQuery$ and result$, not params$
			query.rxQuery$.subscribe((rxQuery) => {
				expect(rxQuery).toBeDefined();
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

	/**
	 * Critical test: useQuery must NEVER return undefined.
	 * Components access query.result$ immediately - undefined causes crashes.
	 * This test catches the bug where useObservableState returns undefined
	 * before the observable emits.
	 */
	it('useQuery must never return undefined on initial render', () => {
		let queryOnFirstRender: any = 'not-set';
		let renderCount = 0;

		const TestComponent = () => {
			const query = useQuery({ queryKeys: ['neverUndefined'], collectionName: 'products' });

			// Capture query on every render
			renderCount++;
			if (renderCount === 1) {
				queryOnFirstRender = query;
			}

			// This simulates what real components do - they access query properties immediately
			// If query is undefined, this would throw "Cannot read properties of undefined"
			if (query === undefined) {
				throw new Error('useQuery returned undefined - this breaks components');
			}

			// Access properties that real components use
			const hasResult$ = query.result$ !== undefined;
			const hasRxQuery$ = query.rxQuery$ !== undefined;

			return (
				<div>
					{hasResult$ && hasRxQuery$ ? 'valid' : 'invalid'}
				</div>
			);
		};

		// This should not throw
		expect(() => {
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
		}).not.toThrow();

		// Query should have been defined on first render
		expect(queryOnFirstRender).not.toBe('not-set');
		expect(queryOnFirstRender).not.toBe(undefined);
		expect(queryOnFirstRender).not.toBe(null);
		expect(queryOnFirstRender.result$).toBeDefined();
		expect(queryOnFirstRender.rxQuery$).toBeDefined();
	});
});
