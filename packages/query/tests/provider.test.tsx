import * as React from 'react';

import { cleanup, render, screen } from '@testing-library/react';

import { createStoreDatabase } from './helpers/db';
import { createEngineDatabase, createFakeEngine } from '../src/testing';
import { QueryProvider, useQueryRuntime } from '../src/provider';

import type { FakeEngine } from '../src/testing';
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
			const runtime = useQueryRuntime();
			expect(runtime).toEqual({
				localDB,
				engine,
				locale: 'en',
			});
			expect(runtime).not.toHaveProperty('registerQuery');
			return <span data-testid="runtime-consumer-rendered" />;
		}

		render(
			<QueryProvider localDB={localDB} engine={engine} locale="en">
				<Consumer />
			</QueryProvider>
		);
		expect(screen.getByTestId('runtime-consumer-rendered')).toBeTruthy();
	});

	it('rejects consumers outside the provider', () => {
		function Consumer() {
			useQueryRuntime();
			return null;
		}
		expect(() => render(<Consumer />)).toThrow(
			'useQueryRuntime must be used within a QueryProvider'
		);
	});
});
