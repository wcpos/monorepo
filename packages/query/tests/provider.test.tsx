import * as React from 'react';

import { cleanup, render } from '@testing-library/react';

import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase } from './helpers/db';
import { createEngineDatabase, createFakeEngine } from './helpers/engine';
import { QueryProvider, useQueryManager } from '../src/provider';
import { useQuery } from '../src/use-query';

import type { FakeEngine } from './helpers/engine';
import type { RxDatabase } from 'rxdb';

// Mock the logger module
jest.mock('@wcpos/utils/src/logger');

describe('QueryProvider', () => {
	let localDB: RxDatabase;
	let engineDB: RxDatabase;
	let engine: FakeEngine;

	beforeEach(async () => {
		localDB = await createStoreDatabase();
		engineDB = await createEngineDatabase();
		engine = createFakeEngine(engineDB);
	});

	afterEach(async () => {
		if (localDB && !localDB.destroyed) {
			await localDB.remove();
		}
		if (engineDB && !engineDB.destroyed) {
			await engineDB.remove();
		}
		cleanup();
		jest.clearAllMocks();
	});

	function Provider({ children }: { children: React.ReactNode }) {
		return (
			<QueryProvider localDB={localDB} engine={engine} http={httpClientMock} locale="">
				{children}
			</QueryProvider>
		);
	}

	it('should provide a Manager instance holding the engine', () => {
		function TestComponent() {
			const manager = useQueryManager();
			expect(manager).toBeDefined();
			expect(manager.engine).toBe(engine);
			return <div>Test</div>;
		}

		render(
			<Provider>
				<TestComponent />
			</Provider>
		);
	});

	it('should create and retrieve a query instance', () => {
		function TestComponent1() {
			const query = useQuery({ queryKeys: ['myQuery'], collectionName: 'products' });
			expect(query).toBeDefined();
			return <div />;
		}
		function TestComponent2() {
			const manager = useQueryManager();
			const query = manager.getQuery(['myQuery']);
			expect(query).toBeDefined();
			return <div />;
		}

		render(
			<Provider>
				<TestComponent1 />
				<TestComponent2 />
			</Provider>
		);
	});

	it('should have initial values for query.rxQuery$ and query.result$', (done) => {
		function TestComponent() {
			const query = useQuery({ queryKeys: ['myQuery'], collectionName: 'products' });

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
		}

		render(
			<Provider>
				<TestComponent />
			</Provider>
		);
	});

	/**
	 * Critical: useQuery must NEVER return undefined on the initial render.
	 */
	it('useQuery must never return undefined on initial render', () => {
		let queryOnFirstRender: any = 'not-set';
		let renderCount = 0;

		function TestComponent() {
			const query = useQuery({ queryKeys: ['neverUndefined'], collectionName: 'products' });
			renderCount++;
			if (renderCount === 1) {
				queryOnFirstRender = query;
			}
			if (query === undefined) {
				throw new Error('useQuery returned undefined - this breaks components');
			}
			const hasResult$ = query.result$ !== undefined;
			const hasRxQuery$ = query.rxQuery$ !== undefined;
			return <div>{hasResult$ && hasRxQuery$ ? 'valid' : 'invalid'}</div>;
		}

		expect(() => {
			render(
				<Provider>
					<TestComponent />
				</Provider>
			);
		}).not.toThrow();

		expect(queryOnFirstRender).not.toBe('not-set');
		expect(queryOnFirstRender).not.toBe(undefined);
		expect(queryOnFirstRender).not.toBe(null);
		expect(queryOnFirstRender.result$).toBeDefined();
		expect(queryOnFirstRender.rxQuery$).toBeDefined();
	});
});
