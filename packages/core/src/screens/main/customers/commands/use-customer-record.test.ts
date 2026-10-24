/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import type { ReadonlyEngineRecord } from '@wcpos/query';
import { CreateScopeChangedTwiceError } from '@wcpos/query/mutations';

import { useCustomerRecord } from './use-customer-record';

const mockCreate = jest.fn();
const mockMutationOptions = jest.fn();
const mockLocalPatch = jest.fn();

jest.mock('../../hooks/mutations/use-mutation', () => ({
	useMutation: (options: unknown) => {
		mockMutationOptions(options);
		return { create: mockCreate };
	},
}));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

const customer = {
	uuid: 'customer-1',
	payload: { first_name: 'Ada' },
} as unknown as ReadonlyEngineRecord<'customers'>;

describe('useCustomerRecord', () => {
	beforeEach(() => jest.resetAllMocks());

	it('catches the already-toasted scope-changed-twice create rejection', async () => {
		mockCreate.mockRejectedValue(new CreateScopeChangedTwiceError('customers'));
		const { result } = renderHook(() => useCustomerRecord());
		await expect(result.current.createCustomer({ first_name: 'Ada' })).resolves.toBeUndefined();
	});

	it('returns the created customer for the screen to navigate back', async () => {
		mockCreate.mockResolvedValue(customer);
		const { result } = renderHook(() => useCustomerRecord());
		await expect(result.current.createCustomer({ first_name: 'Ada' })).resolves.toBe(customer);
		expect(mockCreate).toHaveBeenCalledWith({ data: { first_name: 'Ada' } });
		expect(mockMutationOptions).toHaveBeenCalledWith({
			collectionName: 'customers',
			showSuccessToast: false,
		});
	});

	it.each([undefined, {}])('does not report a save without a document (%p)', async (saved) => {
		mockLocalPatch.mockResolvedValue(saved);
		const { result } = renderHook(() => useCustomerRecord());
		await expect(
			result.current.saveCustomerFields(customer, { first_name: 'Updated' })
		).resolves.toBe(false);
	});

	it('reports a saved document so the form can push and toast', async () => {
		mockLocalPatch.mockResolvedValue({ document: customer });
		const { result } = renderHook(() => useCustomerRecord());
		await expect(
			result.current.saveCustomerFields(customer, { first_name: 'Updated' })
		).resolves.toBe(true);
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: customer,
			data: { first_name: 'Updated' },
		});
	});

	it('forwards local write rejection to the form error handler', async () => {
		const error = new Error('write failed');
		mockLocalPatch.mockRejectedValue(error);
		const { result } = renderHook(() => useCustomerRecord());
		await expect(
			result.current.saveCustomerFields(customer, { first_name: 'Updated' })
		).rejects.toBe(error);
	});
});
