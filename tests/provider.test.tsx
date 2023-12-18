import * as React from 'react';

import { render, cleanup } from '@testing-library/react';

import httpClientMock from './__mocks__/http';
import { MockRxDatabase } from './__mocks__/rxdb';
import { QueryProvider, useQueryManager } from '../src/provider';
import { useQuery } from '../src/use-query';

import type { RxDatabase } from 'rxdb';

describe('QueryProvider', () => {
	let mockDatabase: RxDatabase;

	beforeEach(() => {
		mockDatabase = new MockRxDatabase() as unknown as RxDatabase;
		mockDatabase.addCollections({
			testCollection: { schema: {} },
		});
	});

	afterEach(() => {
		// jest.clearAllMocks();
		cleanup();
	});

	it('should provide a Manager instance', () => {
		const TestComponent = () => {
			const manager = useQueryManager();
			expect(manager).toBeDefined();
			return <div>Test</div>;
		};

		render(
			<QueryProvider localDB={mockDatabase} http={httpClientMock}>
				<TestComponent />
			</QueryProvider>
		);
	});

	it('should create and retrieve a query instance', () => {
		// TestComponent1 uses useQuery to create a query
		const TestComponent1 = () => {
			const query = useQuery({ queryKey: ['myQuery'], collectionName: 'testCollection' });
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
			<QueryProvider localDB={mockDatabase} http={httpClientMock}>
				<TestComponent1 />
				<TestComponent2 />
			</QueryProvider>
		);
	});

	it('should have initial values for query.params$ and query.result$', (done) => {
		const TestComponent = () => {
			const query = useQuery({ queryKey: ['myQuery'], collectionName: 'testCollection' });

			const paramsPromise = new Promise((resolve) => {
				const paramsSubscription = query.params$.subscribe((params) => {
					resolve(params);
					paramsSubscription.unsubscribe();
				});
			});

			const dataPromise = new Promise((resolve) => {
				const querySubscription = query.result$.subscribe((data) => {
					resolve(data);
					querySubscription.unsubscribe();
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
			<QueryProvider localDB={mockDatabase} http={httpClientMock}>
				<TestComponent />
			</QueryProvider>
		);
	});
});
