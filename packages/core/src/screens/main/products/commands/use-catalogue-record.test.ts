/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { useCatalogueRecord } from './use-catalogue-record';

const mockProductsPatch = jest.fn();
const mockVariationsPatch = jest.fn();
const mockLocalPatch = jest.fn();

jest.mock('../../hooks/mutations/use-mutation', () => ({
	useMutation: ({ collectionName }: { collectionName: string }) => ({
		patchRecord: collectionName === 'products' ? mockProductsPatch : mockVariationsPatch,
	}),
}));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

describe('useCatalogueRecord', () => {
	beforeEach(() => jest.resetAllMocks());

	describe.each(['simple', 'variable', 'variation'] as const)('%s record', (type) => {
		const record = { uuid: 'catalogue-1', payload: { type } } as unknown as
			EngineRecord<'products'> | EngineRecord<'variations'>;
		const data = { regular_price: '12.50', tax_class: '' };

		it('reports a saved document and forwards the form fields unchanged', async () => {
			mockLocalPatch.mockResolvedValue({ document: record });
			const { result } = renderHook(() => useCatalogueRecord());
			await expect(result.current.saveCatalogueFields(record, data)).resolves.toBe(true);
			expect(mockLocalPatch).toHaveBeenCalledTimes(1);
			expect(mockLocalPatch).toHaveBeenCalledWith({ document: record, data });
			expect(mockProductsPatch).not.toHaveBeenCalled();
			expect(mockVariationsPatch).not.toHaveBeenCalled();
		});

		it('does not report success when the local write resolves undefined', async () => {
			mockLocalPatch.mockResolvedValue(undefined);
			const { result } = renderHook(() => useCatalogueRecord());
			await expect(result.current.saveCatalogueFields(record, data)).resolves.toBe(false);
		});

		it('propagates local rejection to the form error handler', async () => {
			const error = new Error('write failed');
			mockLocalPatch.mockRejectedValue(error);
			const { result } = renderHook(() => useCatalogueRecord());
			await expect(result.current.saveCatalogueFields(record, data)).rejects.toBe(error);
		});

		it('routes inline edits by payload type and returns the mutation result', async () => {
			const selected = type === 'variation' ? mockVariationsPatch : mockProductsPatch;
			const other = type === 'variation' ? mockProductsPatch : mockVariationsPatch;
			selected.mockResolvedValue(record);
			const { result } = renderHook(() => useCatalogueRecord());
			await expect(result.current.saveCatalogueChange(record, data)).resolves.toBe(record);
			expect(selected).toHaveBeenCalledTimes(1);
			expect(selected).toHaveBeenCalledWith({ document: record, data });
			expect(other).not.toHaveBeenCalled();
			expect(mockLocalPatch).not.toHaveBeenCalled();
		});
	});
});
