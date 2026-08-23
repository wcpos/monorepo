/**
 * @jest-environment jsdom
 */
import { serialize as structuredSerialize } from 'node:v8';

import { act, renderHook } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { useMutation } from './use-mutation';

const mockInsertEngineResident = jest.fn();
const mockWrite = jest.fn();
const mockStatus = jest.fn();
const mockAwaitWriteOutcome = jest.fn();
const mockFindEngineResident = jest.fn();
const mockLocalPatch = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerSuccess = jest.fn();

jest.mock('uuid', () => ({
	v4: () => 'born-local-uuid',
}));

jest.mock('@wcpos/query', () => ({
	COLLECTION_VOCABULARY: jest.requireActual('@wcpos/query').COLLECTION_VOCABULARY,
	useQueryRuntime: () => ({ engine: { write: mockWrite, status: mockStatus } }),
	awaitWriteOutcome: (...args: unknown[]) => mockAwaitWriteOutcome(...args),
}));

jest.mock('./use-local-mutation', () => ({
	documentRecordId: (document: { uuid?: unknown; id?: unknown }) => document.uuid ?? document.id,
	insertEngineResident: (...args: unknown[]) => mockInsertEngineResident(...args),
	findEngineResident: (...args: unknown[]) => mockFindEngineResident(...args),
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
	getLogger: () => ({
		error: (...args: unknown[]) => mockLoggerError(...args),
		success: (...args: unknown[]) => mockLoggerSuccess(...args),
	}),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: () => '2026-07-14T00:00:00',
}));

jest.mock('../use-collection', () => ({
	useCollection: () => ({ collectionLabel: 'Order' }),
}));

/**
 * A faithful RxDocument stand-in for the create path.
 *
 * RxDB hands back a **Proxy** from `RxDocument.get()` for object-valued paths
 * (`getDocumentProperty`), and a Proxy cannot be structured-cloned — so a
 * payload sourced that way dies at the `postMessage` into the storage worker
 * with "#<Object> could not be cloned". These stubs proxy `get('payload')` the
 * same way, so a regression back to `.get()` fails here instead of in a
 * browser.
 */
function residentStub(payload: Record<string, unknown>, fields: Record<string, unknown> = {}) {
	const proxied = new Proxy({ ...payload }, {});
	return {
		payload,
		get: (field: string) => (field === 'payload' ? proxied : fields[field]),
		toMutableJSON: () => JSON.parse(JSON.stringify({ payload })) as { payload: unknown },
		remove: jest.fn().mockResolvedValue(undefined),
	};
}

describe('useMutation', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1', recordId: 'born-local-uuid' });
		mockStatus.mockReturnValue({ activeScopeId: 'scope-1' });
		mockAwaitWriteOutcome.mockResolvedValue('success');
	});

	it('removes a born-local resident when its create intent cannot be enqueued', async () => {
		const remove = jest.fn().mockResolvedValue(undefined);
		mockInsertEngineResident.mockResolvedValue({
			...residentStub({ status: 'pending' }),
			remove,
		});
		mockWrite.mockRejectedValue(new Error('queue unavailable'));
		const { result } = renderHook(() => useMutation({ collectionName: 'orders' }));

		await act(() => result.current.create({ data: { status: 'pending' } }));

		expect(remove).toHaveBeenCalledTimes(1);
	});

	it('compensates and retries a born-local insert once when the active scope changes', async () => {
		let activeScopeId = 'scope-1';
		mockStatus.mockImplementation(() => ({ activeScopeId }));
		const first = residentStub({ status: 'pending' });
		const second = residentStub({ status: 'pending' });
		mockInsertEngineResident.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
		mockWrite
			.mockImplementationOnce(async () => {
				activeScopeId = 'scope-2';
				return { mutationId: 'mutation-1', recordId: 'born-local-uuid' };
			})
			.mockResolvedValueOnce({ mutationId: 'mutation-2', recordId: 'born-local-uuid' });
		const { result } = renderHook(() => useMutation({ collectionName: 'orders' }));

		await act(() => result.current.create({ data: { status: 'pending' } }));

		expect(first.remove).toHaveBeenCalledTimes(1);
		expect(second.remove).not.toHaveBeenCalled();
		expect(mockInsertEngineResident).toHaveBeenCalledTimes(2);
		expect(mockWrite).toHaveBeenCalledTimes(2);
	});

	it('compensates and throws when a born-local insert crosses scopes twice', async () => {
		let activeScopeId = 'scope-1';
		mockStatus.mockImplementation(() => ({ activeScopeId }));
		const first = residentStub({ status: 'pending' });
		const second = residentStub({ status: 'pending' });
		mockInsertEngineResident.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
		mockWrite
			.mockImplementationOnce(async () => {
				activeScopeId = 'scope-2';
				return { mutationId: 'mutation-1', recordId: 'born-local-uuid' };
			})
			.mockImplementationOnce(async () => {
				activeScopeId = 'scope-3';
				return { mutationId: 'mutation-2', recordId: 'born-local-uuid' };
			});
		const { result } = renderHook(() => useMutation({ collectionName: 'orders' }));

		await expect(result.current.create({ data: { status: 'pending' } })).rejects.toThrow(
			'Active engine scope changed twice during orders create'
		);

		expect(first.remove).toHaveBeenCalledTimes(1);
		expect(second.remove).toHaveBeenCalledTimes(1);
		expect(mockWrite).toHaveBeenCalledTimes(2);
	});

	it('awaits a customer create outcome and returns the rematerialized Woo id on request', async () => {
		const initial = residentStub({ first_name: 'Ada' }, { remoteId: null });
		const refreshed = residentStub({ id: 321, first_name: 'Ada' }, { remoteId: '321' });
		mockInsertEngineResident.mockResolvedValue(initial);
		mockFindEngineResident.mockResolvedValue(refreshed);
		const { result } = renderHook(() => useMutation({ collectionName: 'customers' }));

		const created = await act(() =>
			result.current.create({ data: { first_name: 'Ada' }, awaitRemoteId: true })
		);

		expect(mockAwaitWriteOutcome).toHaveBeenCalledWith(
			expect.objectContaining({ write: mockWrite }),
			'mutation-1'
		);
		expect(mockWrite).toHaveBeenCalledWith(
			expect.objectContaining({ explicit: true, operation: 'create' })
		);
		expect(mockFindEngineResident).toHaveBeenCalledWith(
			expect.anything(),
			'customers',
			'born-local-uuid'
		);
		expect((created as unknown as { payload: { id: number } }).payload.id).toBe(321);
	});

	it('does not mark a create explicit when no remote id is awaited', async () => {
		mockInsertEngineResident.mockResolvedValue(residentStub({ status: 'pos-open' }));
		const { result } = renderHook(() => useMutation({ collectionName: 'orders' }));

		await act(() => result.current.create({ data: { status: 'pos-open' } }));

		expect(mockWrite).toHaveBeenCalledWith(
			expect.not.objectContaining({ explicit: expect.anything() })
		);
	});

	it('preserves an engine record UUID when a customer patch does not update', async () => {
		const customer = {
			uuid: 'customer-local-uuid',
			collection: { name: 'customers' },
			payload: { id: 42 },
		} as unknown as EngineRecord<'customers'>;
		mockLocalPatch.mockResolvedValueOnce(undefined);
		const { result } = renderHook(() => useMutation({ collectionName: 'customers' }));

		await act(() => result.current.patch({ document: customer, data: { first_name: 'Ada' } }));

		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: customer,
			data: { first_name: 'Ada' },
		});
		expect(mockLoggerError).toHaveBeenCalledWith(
			'common.not_updated',
			expect.objectContaining({
				context: expect.objectContaining({ documentId: 'customer-local-uuid' }),
			})
		);
	});

	it('logs the payload id from a record-shaped patch result', async () => {
		const customer = {
			uuid: 'customer-local-uuid',
			collection: { name: 'customers' },
			payload: { id: 42, first_name: 'Ada' },
		} as unknown as EngineRecord<'customers'>;
		mockLocalPatch.mockResolvedValueOnce({ changes: {}, document: customer });
		const { result } = renderHook(() => useMutation({ collectionName: 'customers' }));

		await act(() => result.current.patch({ document: customer, data: { first_name: 'Ada' } }));

		expect(mockLoggerSuccess).toHaveBeenCalledWith(
			'common.saved_2',
			expect.objectContaining({
				context: expect.objectContaining({ documentId: 42 }),
			})
		);
	});

	it('hands the engine a structured-cloneable customer payload', async () => {
		// The web storage lives in a Worker and Electron's behind ipcRenderer, so the
		// enqueued payload crosses `postMessage`. Sourcing it from `resident.get()`
		// hands over an RxDB Proxy, which fails the write with
		// "#<Object> could not be cloned" — customers have no rewriting outbound
		// sanitizer to launder it away, so the create simply dies.
		mockInsertEngineResident.mockResolvedValue(
			residentStub({ first_name: 'Ada', billing: { email: 'ada@example.com' } })
		);
		const { result } = renderHook(() => useMutation({ collectionName: 'customers' }));

		await act(() =>
			result.current.create({
				data: { first_name: 'Ada', billing: { email: 'ada@example.com' } },
			})
		);

		const { payload } = mockWrite.mock.calls[0][0] as { payload: Record<string, unknown> };
		// jsdom omits `structuredClone`; `v8.serialize` runs the same algorithm the
		// storage worker's `postMessage` does, and raises the same DataCloneError.
		expect(() => structuredSerialize(payload)).not.toThrow();
		expect(payload).toEqual({ first_name: 'Ada', billing: { email: 'ada@example.com' } });
	});

	it('throws without removing the resident when an awaited customer create is rejected', async () => {
		const resident = residentStub({ first_name: 'Ada' });
		mockInsertEngineResident.mockResolvedValue(resident);
		mockAwaitWriteOutcome.mockRejectedValueOnce(
			new Error('write-rejected for mutation "mutation-1"')
		);
		const { result } = renderHook(() => useMutation({ collectionName: 'customers' }));

		await expect(
			result.current.create({ data: { first_name: 'Ada' }, awaitRemoteId: true })
		).rejects.toThrow('write-rejected for mutation "mutation-1"');
		expect(resident.remove).not.toHaveBeenCalled();
	});
});
