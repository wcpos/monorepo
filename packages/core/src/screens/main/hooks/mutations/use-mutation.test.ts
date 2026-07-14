/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useMutation } from './use-mutation';

const mockInsertEngineResident = jest.fn();
const mockFindEngineResident = jest.fn();
const mockWrite = jest.fn();
const mockSync = jest.fn();
const mockWrapEngineDocument = jest.fn((_collection: string, resident: unknown) => ({
	id: (resident as { wooCustomerId?: number | null }).wooCustomerId,
}));

const activeScope = { database: { collections: {} } };

jest.mock('uuid', () => ({
	v4: () => 'born-local-uuid',
}));

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({
		engine: { active: () => activeScope, write: mockWrite, sync: mockSync },
	}),
}));

jest.mock('@wcpos/query/engine-adapter/document-proxy', () => ({
	wrapEngineDocument: (...args: [string, unknown]) => mockWrapEngineDocument(...args),
}));

jest.mock('./use-local-mutation', () => ({
	findEngineResident: (...args: unknown[]) => mockFindEngineResident(...args),
	insertEngineResident: (...args: unknown[]) => mockInsertEngineResident(...args),
	useLocalMutation: () => ({ localPatch: jest.fn() }),
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

describe('useMutation', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockWrite.mockImplementation(async (_intent, options) => {
			await options?.prepare?.(activeScope);
			return { mutationId: 'mutation-1', recordId: 'born-local-uuid' };
		});
		mockSync.mockResolvedValue({ lane: 'write-drain', status: 'ran', pushed: 1 });
	});

	it('returns a new customer only after its Woo id is acknowledged when required', async () => {
		const resident = {
			wooCustomerId: null as number | null,
			get: (field: string) =>
				field === 'payload'
					? { first_name: 'Ada' }
					: field === 'wooCustomerId'
						? resident.wooCustomerId
						: undefined,
			remove: jest.fn(),
		};
		mockInsertEngineResident.mockResolvedValue(resident);
		mockFindEngineResident.mockImplementation(async () => resident);
		mockSync.mockImplementation(async () => {
			resident.wooCustomerId = 88;
			return { lane: 'write-drain', status: 'ran', pushed: 1 };
		});
		const { result } = renderHook(() => useMutation({ collectionName: 'customers' }));

		const saved = await act(() =>
			result.current.create({ data: { first_name: 'Ada' }, requireCustomerId: true })
		);

		expect(mockSync).toHaveBeenCalledWith('write-drain');
		expect(mockFindEngineResident).toHaveBeenCalledWith(
			expect.anything(),
			'customers',
			'born-local-uuid'
		);
		expect(saved).toMatchObject({ id: 88 });
	});

	it('removes a born-local resident when its create intent cannot be enqueued', async () => {
		const remove = jest.fn().mockResolvedValue(undefined);
		mockInsertEngineResident.mockResolvedValue({
			get: () => ({ status: 'pending' }),
			remove,
		});
		mockWrite.mockImplementationOnce(async (_intent, options) => {
			await options?.prepare?.(activeScope);
			await options?.rollback?.();
			throw new Error('queue unavailable');
		});
		const { result } = renderHook(() => useMutation({ collectionName: 'orders' }));

		await act(() => result.current.create({ data: { status: 'pending' } }));

		expect(remove).toHaveBeenCalledTimes(1);
	});
});
