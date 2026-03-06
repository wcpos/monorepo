/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { StorageHealthProvider, useStorageHealth } from './provider';

const mockPauseAllReplications = jest.fn();

type StorageHealthSubject = BehaviorSubject<{
	status: 'healthy' | 'degraded';
	reason?: string;
	source?: string;
}>;

jest.mock('@wcpos/database', () => {
	(globalThis as { __storageHealthSubject?: StorageHealthSubject }).__storageHealthSubject =
		new BehaviorSubject<{
			status: 'healthy' | 'degraded';
			reason?: string;
			source?: string;
		}>({ status: 'healthy' });

	return {
		getStorageHealthSnapshot: () =>
			(
				globalThis as { __storageHealthSubject?: StorageHealthSubject }
			).__storageHealthSubject?.getValue(),
		storageHealth$: (
			globalThis as { __storageHealthSubject?: StorageHealthSubject }
		).__storageHealthSubject?.asObservable(),
	};
});

jest.mock(
	'@wcpos/query',
	() => ({
		useQueryManager: () => ({
			pauseAllReplications: mockPauseAllReplications,
		}),
	}),
	{ virtual: true }
);

function Consumer() {
	const { status } = useStorageHealth();
	return React.createElement('span', null, status);
}

describe('StorageHealthProvider', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(globalThis as { __storageHealthSubject?: StorageHealthSubject }).__storageHealthSubject?.next({
			status: 'healthy',
		});
	});

	it('updates context and pauses replications when storage degrades', () => {
		render(React.createElement(StorageHealthProvider, null, React.createElement(Consumer)));

		expect(screen.getByText('healthy')).toBeTruthy();

		act(() => {
			(
				globalThis as { __storageHealthSubject?: StorageHealthSubject }
			).__storageHealthSubject?.next({
				status: 'degraded',
				reason: 'could not requestRemote',
				source: 'bulkWrite',
			});
		});

		expect(screen.getByText('degraded')).toBeTruthy();
		expect(mockPauseAllReplications).toHaveBeenCalledWith('storage-health');
	});
});
