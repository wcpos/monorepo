/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { Subject } from 'rxjs';

import { useReferencedCustomerDemand } from './use-referenced-customer-demand';

type Result = {
	hits: {
		document: {
			customer_id?: unknown;
			meta_data?: { key?: string; value?: unknown }[];
		};
	}[];
};

const requireCustomer = jest.fn();
const engine = { require: requireCustomer };

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({ engine }),
}));

function resolvedHandle() {
	return { ready: Promise.resolve(), release: jest.fn() };
}

describe('useReferencedCustomerDemand', () => {
	beforeEach(() => {
		requireCustomer.mockReset();
		requireCustomer.mockImplementation(resolvedHandle);
	});

	it('declares unique referenced customers once and only declares newly appearing ids', () => {
		const result$ = new Subject<Result>();
		const firstHandle = resolvedHandle();
		const secondHandle = resolvedHandle();
		requireCustomer.mockReturnValueOnce(firstHandle).mockReturnValueOnce(secondHandle);
		const { rerender, unmount } = renderHook(() => useReferencedCustomerDemand(result$));

		act(() => {
			result$.next({
				hits: [
					{ document: { customer_id: 5 } },
					{ document: { customer_id: 0 } },
					{
						document: {
							customer_id: 5,
							meta_data: [{ key: '_pos_user', value: '7' }],
						},
					},
				],
			});
		});

		expect(requireCustomer).toHaveBeenCalledWith({
			id: 'orders:referenced-customers:5,7',
			collection: 'customers',
			kind: 'targeted-records',
			wooIds: [5, 7],
		});
		rerender();
		expect(firstHandle.release).not.toHaveBeenCalled();

		act(() => {
			result$.next({
				hits: [
					{
						document: {
							customer_id: 5,
							meta_data: [{ key: '_pos_user', value: 7 }],
						},
					},
				],
			});
		});
		expect(requireCustomer).toHaveBeenCalledTimes(1);

		act(() => {
			result$.next({
				hits: [
					{
						document: {
							customer_id: 5,
							meta_data: [{ key: '_pos_user', value: 7 }],
						},
					},
					{ document: { customer_id: 9 } },
				],
			});
		});
		expect(requireCustomer).toHaveBeenLastCalledWith({
			id: 'orders:referenced-customers:5,7,9',
			collection: 'customers',
			kind: 'targeted-records',
			wooIds: [9],
		});
		expect(firstHandle.release).toHaveBeenCalledTimes(1);

		unmount();
		expect(secondHandle.release).toHaveBeenCalledTimes(1);
	});

	it('does not redeclare a rejected id when later results change away and back', async () => {
		const result$ = new Subject<Result>();
		const handle = { ready: Promise.reject(new Error('deleted')), release: jest.fn() };
		requireCustomer.mockReturnValueOnce(handle);
		renderHook(() => useReferencedCustomerDemand(result$));

		await act(async () => {
			result$.next({ hits: [{ document: { customer_id: 11 } }] });
			await handle.ready.catch(() => undefined);
		});
		act(() => result$.next({ hits: [] }));
		act(() => result$.next({ hits: [{ document: { customer_id: 11 } }] }));

		expect(requireCustomer).toHaveBeenCalledTimes(1);
	});

	it('ignores non-positive customer ids and invalid cashier metadata', () => {
		const result$ = new Subject<Result>();
		renderHook(() => useReferencedCustomerDemand(result$));

		act(() => {
			result$.next({
				hits: [
					{ document: { customer_id: -1 } },
					{ document: { customer_id: Number.NaN } },
					{ document: { customer_id: 1.5 } },
					{ document: { meta_data: [{ key: '_pos_user', value: 'cashier' }] } },
					{ document: { meta_data: [{ key: '_pos_user', value: '0' }] } },
				],
			});
		});

		expect(requireCustomer).not.toHaveBeenCalled();
	});
});
