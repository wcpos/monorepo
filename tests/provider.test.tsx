import * as React from 'react';

import { render, cleanup } from '@testing-library/react';

import httpClientMock from './__mocks__/http';
import { MockRxDatabase } from './__mocks__/rxdb';
import { QueryProvider, useQueryManager } from '../src/provider';

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

	// Additional tests...
});
