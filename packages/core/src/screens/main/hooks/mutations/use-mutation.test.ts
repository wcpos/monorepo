/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useMutation } from './use-mutation';

const mockInsertEngineResident = jest.fn();
const mockWrite = jest.fn();

jest.mock('uuid', () => ({
	v4: () => 'born-local-uuid',
}));

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({ engine: { write: mockWrite } }),
}));

jest.mock('@wcpos/query/engine-adapter/document-proxy', () => ({
	wrapEngineDocument: jest.fn(),
}));

jest.mock('./use-local-mutation', () => ({
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
	});

	it('removes a born-local resident when its create intent cannot be enqueued', async () => {
		const remove = jest.fn().mockResolvedValue(undefined);
		mockInsertEngineResident.mockResolvedValue({
			get: () => ({ status: 'pending' }),
			remove,
		});
		mockWrite.mockRejectedValue(new Error('queue unavailable'));
		const { result } = renderHook(() => useMutation({ collectionName: 'orders' }));

		await act(() => result.current.create({ data: { status: 'pending' } }));

		expect(remove).toHaveBeenCalledTimes(1);
	});
});
