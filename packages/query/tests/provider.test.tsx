import * as React from 'react';

import { cleanup, render } from '@testing-library/react';

import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase } from './helpers/db';
import { createEngineDatabase, createFakeEngine } from './helpers/engine';
import { QueryProvider, useQueryManager } from '../src/provider';

import type { FakeEngine } from './helpers/engine';
import type { RxDatabase } from 'rxdb';

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
		cleanup();
		if (localDB && !localDB.destroyed) await localDB.remove();
		if (engineDB && !engineDB.destroyed) await engineDB.remove();
	});

	it('provides the direct runtime dependencies without a fluent manager surface', () => {
		function Consumer() {
			const runtime = useQueryManager();
			expect(runtime).toEqual({
				localDB,
				engine,
				locale: 'en',
				httpClient: httpClientMock,
			});
			expect(runtime).not.toHaveProperty('registerQuery');
			return null;
		}

		render(
			<QueryProvider localDB={localDB} engine={engine} http={httpClientMock} locale="en">
				<Consumer />
			</QueryProvider>
		);
	});

	it('rejects consumers outside the provider', () => {
		function Consumer() {
			useQueryManager();
			return null;
		}
		expect(() => render(<Consumer />)).toThrow(
			'useQueryManager must be used within a QueryProvider'
		);
	});
});
