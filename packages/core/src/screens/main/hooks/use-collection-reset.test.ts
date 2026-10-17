/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useCollectionReset } from './use-collection-reset';

const mockResetCollection = jest.fn();
const mockRunResetRefill = jest.fn(async () => undefined);
const mockToastShow = jest.fn();

jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: (...args: unknown[]) => mockToastShow(...args) },
}));
jest.mock('@wcpos/query', () => ({
	COLLECTION_VOCABULARY: {
		products: { legacyName: 'products' },
		variations: { legacyName: 'variations' },
		customers: { legacyName: 'customers' },
	},
	runResetRefill: (...args: unknown[]) => mockRunResetRefill(...(args as [])),
	useQueryRuntime: () => ({ engine: { scope: { resetCollection: mockResetCollection } } }),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

describe('useCollectionReset', () => {
	beforeEach(() => jest.clearAllMocks());

	it('tells the cashier why "Clear and sync" did nothing when unsent changes would be lost', async () => {
		mockResetCollection.mockResolvedValue('needs-confirmation');
		const { result } = renderHook(() => useCollectionReset('customers'));

		await act(() => result.current.clearAndSync());

		// Never cleared, never refilled — but no longer a dead button.
		expect(mockRunResetRefill).not.toHaveBeenCalled();
		expect(mockToastShow).toHaveBeenCalledWith({
			type: 'warning',
			title: 'common.clear_blocked_unsent',
			description: 'common.clear_blocked_unsent_hint',
		});
	});

	it('clears and refills silently when nothing is waiting to be sent', async () => {
		mockResetCollection.mockResolvedValue('reset');
		const { result } = renderHook(() => useCollectionReset('customers'));

		await act(() => result.current.clearAndSync());

		expect(mockRunResetRefill).toHaveBeenCalledTimes(1);
		expect(mockToastShow).not.toHaveBeenCalled();
	});
});
