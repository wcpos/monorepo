/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import {
	clearStorageDegradation,
	wrappedErrorHandlerStorage,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';

import { useStorageDegraded } from './use-storage-health';

/**
 * End-to-end over the seam that mattered in #163: the storage wrapper sets the
 * latch, the POS reads it. Mocking the observable here would prove nothing.
 */
function createWrappedInstance(databaseName: string, bulkWrite: jest.Mock) {
	const instance = {
		schema: { version: 0, type: 'object', properties: {}, primaryKey: 'id' },
		findDocumentsById: jest.fn(),
		bulkWrite,
		query: jest.fn(),
		count: jest.fn(),
		getAttachmentData: jest.fn(),
		getChangedDocumentsSince: jest.fn(),
		changeStream: jest.fn(),
		cleanup: jest.fn(),
		close: jest.fn().mockResolvedValue(undefined),
		remove: jest.fn(),
		collectionName: 'products',
		databaseName,
		internals: {},
		options: {},
	};
	return wrappedErrorHandlerStorage({
		storage: {
			name: 'mock-storage',
			rxdbVersion: '17.4.0',
			createStorageInstance: jest.fn().mockResolvedValue(instance),
		} as any,
	}).createStorageInstance({ databaseName } as any);
}

describe('useStorageDegraded', () => {
	afterEach(() => {
		clearStorageDegradation();
	});

	it('is false while storage is healthy', () => {
		const { result } = renderHook(() => useStorageDegraded());

		expect(result.current).toBe(false);
	});

	it('stays true after a degraded scope closes while the shared worker remains', async () => {
		const wrappedInstance = await createWrappedInstance(
			'pos-store-1',
			jest
				.fn()
				.mockRejectedValue(
					new Error(
						'could not requestRemote: {"methodName":"bulkWrite","error":{"message":"worker gone"}}'
					)
				)
		);
		const { result } = renderHook(() => useStorageDegraded());

		await act(async () => {
			await expect(
				wrappedInstance.bulkWrite([{ document: { id: '1' } }] as any, 'test')
			).rejects.toThrow();
		});

		expect(result.current).toBe(true);

		await act(async () => {
			await wrappedInstance.close();
		});

		expect(result.current).toBe(true);
	});
});
