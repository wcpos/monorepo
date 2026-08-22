/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { useAddCustomer } from './use-add-customer';

const localPatch = jest.fn();
const mockLoggerSuccess = jest.fn();
const mockGuestCustomer = {
	id: 0,
	first_name: 'Guest Default',
	email: 'guest-default@example.com',
	billing: { first_name: 'Guest Billing', email: 'guest-billing@example.com' },
	shipping: { first_name: 'Guest Shipping' },
};
const mockStore = { uuid: 'store-uuid' };

jest.mock('@wcpos/utils/logger', () => {
	const logger = {
		get success() {
			return mockLoggerSuccess;
		},
		with: () => logger,
	};
	return { getLogger: () => logger };
});

jest.mock('@wcpos/query', () => ({
	useDocField: (_store: unknown, selector: (value: { store_country: string }) => unknown) =>
		selector({ store_country: 'ES' }),
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: mockStore }),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () =>
		jest
			.requireActual<typeof import('../../../../../jest/translate')>(
				'../../../../../jest/translate'
			)
			.createTestT(),
}));

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch }),
}));

jest.mock('../../hooks/use-guest-customer', () => ({
	useGuestCustomer: () => mockGuestCustomer,
}));

const currentOrderRecord = {
	uuid: 'order-uuid',
	payload: { id: 99, number: '99' },
};

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord }),
}));

describe('useAddCustomer', () => {
	beforeEach(() => {
		localPatch.mockReset();
		mockLoggerSuccess.mockReset();
	});

	it('writes guest defaults when the selected guest has no billing or shipping data', async () => {
		localPatch.mockResolvedValue({ uuid: 'order-uuid' });
		const { result } = renderHook(() => useAddCustomer());

		await result.current.addCustomer({ id: 0 });

		expect(localPatch).toHaveBeenCalledWith({
			document: currentOrderRecord,
			data: expect.objectContaining({
				customer_id: 0,
				billing: expect.objectContaining({
					first_name: 'Guest Billing',
					email: 'guest-billing@example.com',
					country: 'ES',
				}),
				shipping: expect.objectContaining({ first_name: 'Guest Shipping' }),
			}),
		});
		expect(getLogger([]).success).toHaveBeenCalledWith('Customer assigned: Guest', {
			context: {
				customerId: 0,
				customerEmail: 'guest-default@example.com',
				isGuest: true,
			},
		});
	});

	it('preserves a guest selection that already contains billing data', async () => {
		localPatch.mockResolvedValue({ uuid: 'order-uuid' });
		const { result } = renderHook(() => useAddCustomer());

		await result.current.addCustomer({
			id: 0,
			first_name: 'Provided',
			email: 'provided@example.com',
			billing: { first_name: 'Provided Billing', email: 'provided-billing@example.com' },
		});

		expect(localPatch).toHaveBeenCalledWith({
			document: currentOrderRecord,
			data: expect.objectContaining({
				customer_id: 0,
				billing: expect.objectContaining({
					first_name: 'Provided Billing',
					email: 'provided-billing@example.com',
				}),
			}),
		});
		expect(getLogger([]).success).toHaveBeenCalledWith('Customer assigned: Guest', {
			context: {
				customerId: 0,
				customerEmail: 'provided@example.com',
				isGuest: false,
			},
		});
	});

	it('writes the selected registered customer with the store country fallback', async () => {
		const patchResult = { uuid: 'order-uuid' };
		localPatch.mockResolvedValue(patchResult);
		const { result } = renderHook(() => useAddCustomer());

		await expect(
			result.current.addCustomer({
				id: 42,
				first_name: 'Ada',
				last_name: 'Lovelace',
				email: 'ada@example.com',
			})
		).resolves.toBe(patchResult);

		expect(localPatch).toHaveBeenCalledWith({
			document: currentOrderRecord,
			data: expect.objectContaining({
				customer_id: 42,
				billing: expect.objectContaining({
					first_name: 'Ada',
					last_name: 'Lovelace',
					email: 'ada@example.com',
					country: 'ES',
				}),
			}),
		});
	});

	it('does not log assignment success when the local write returns no result', async () => {
		localPatch.mockResolvedValue(undefined);
		const { result } = renderHook(() => useAddCustomer());

		await expect(
			result.current.addCustomer({ id: 42, email: 'ada@example.com' })
		).resolves.toBeUndefined();

		// A success entry for a write that failed is what anyone debugging a lost
		// customer assignment would read first, and believe.
		expect(getLogger([]).success).not.toHaveBeenCalled();
	});
});
