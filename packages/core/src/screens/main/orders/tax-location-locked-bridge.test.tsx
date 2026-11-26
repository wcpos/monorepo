/** @jest-environment jsdom */
import { act, render } from '@testing-library/react';

import { patchEngineResident } from '@wcpos/query/mutations';
import { ORDER_REFRESH_TIMEOUT_MS, readResidentOrder } from '@wcpos/query/record-readers';
import { getLogger } from '@wcpos/utils/logger';

import { TaxLocationLockedBridge } from './tax-location-locked-bridge';

const rejection = {
	type: 'write-rejected',
	collection: 'orders',
	reason: 'wcpos_tax_location_locked',
	recordId: 'order-7',
	mutationId: 'm1',
	status: 422,
};
let emit: (event: typeof rejection) => Promise<void>;
const unsubscribe = jest.fn();
const discard = jest.fn();
const readopt = jest.fn();
const mockRuntime = {
	engine: {
		events: (listener: (event: typeof rejection) => void) => {
			emit = async (event) => {
				await act(async () => listener(event));
			};
			return unsubscribe;
		},
		resolveConflict: discard,
		orderRevision: { readopt },
	},
};
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => mockRuntime }));
jest.mock('@wcpos/query/record-readers', () => ({
	...jest.requireActual('@wcpos/query/record-readers'),
	readResidentOrder: jest.fn(),
}));
jest.mock('@wcpos/query/mutations', () => ({
	patchEngineResident: jest.fn(),
	resolveQueuedChange: (
		engine: { resolveConflict: (id: string, r: string) => Promise<void> },
		id: string,
		r: string
	) => engine.resolveConflict(id, r),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
const warn = getLogger(['test']).warn;
const resident = { payload: { id: 17, customer_note: 'not yet synced' } };
beforeEach(() => {
	jest.clearAllMocks();
	jest.mocked(readResidentOrder).mockResolvedValue(resident as never);
	discard.mockReset().mockResolvedValue(undefined);
	readopt.mockReset().mockResolvedValue(true);
});
it('B1 notifies, discards the refused write, then readopts its Woo id', async () => {
	const view = render(<TaxLocationLockedBridge />);
	await emit(rejection);
	expect(warn).toHaveBeenCalledTimes(1);
	expect(warn).toHaveBeenCalledWith(
		'pos_cart.tax_location_locked',
		expect.objectContaining({ showToast: true, toast: expect.objectContaining({ type: 'error' }) })
	);
	expect(discard).toHaveBeenCalledWith('m1', 'discard');
	expect(readResidentOrder).toHaveBeenCalledWith(mockRuntime, 'order-7');
	expect(readopt).toHaveBeenCalledWith(17);
	expect(discard.mock.invocationCallOrder[0]).toBeLessThan(readopt.mock.invocationCallOrder[0]);
	view.unmount();
	expect(unsubscribe).toHaveBeenCalled();
});
it('B2 throttles only the notice for the same order within ten seconds', async () => {
	jest.useFakeTimers();
	try {
		render(<TaxLocationLockedBridge />);
		await emit(rejection);
		jest.advanceTimersByTime(9999);
		await emit({ ...rejection, mutationId: 'm2' });
		expect(discard.mock.calls).toEqual([
			['m1', 'discard'],
			['m2', 'discard'],
		]);
		expect(readopt.mock.calls).toEqual([[17], [17]]);
		expect(warn).toHaveBeenCalledTimes(1);
		jest.advanceTimersByTime(1);
		await emit({ ...rejection, mutationId: 'm3' });
		expect(warn).toHaveBeenCalledTimes(2);
	} finally {
		jest.useRealTimers();
	}
});
it.each([{ reason: 'other' }, { collection: 'customers' }])('B3 ignores %j', async (other) => {
	render(<TaxLocationLockedBridge />);
	await emit({ ...rejection, ...other });
	expect(warn).not.toHaveBeenCalled();
	expect(discard).not.toHaveBeenCalled();
	expect(readResidentOrder).not.toHaveBeenCalled();
	expect(readopt).not.toHaveBeenCalled();
});
it.each(['false', 'timeout'])(
	'B4 leaves the dead letter discarded on readopt %s',
	async (verdict) => {
		jest.useFakeTimers();
		try {
			readopt.mockReturnValue(verdict === 'false' ? Promise.resolve(false) : new Promise(() => {}));
			render(<TaxLocationLockedBridge />);
			await emit(rejection);
			await jest.advanceTimersByTimeAsync(ORDER_REFRESH_TIMEOUT_MS);
			expect(discard.mock.calls).toEqual([['m1', 'discard']]);
			expect(warn).toHaveBeenCalledTimes(1);
		} finally {
			jest.useRealTimers();
		}
	}
);
it('B5 leaves another pending edit and its resident alone when readopt returns false', async () => {
	const pending = new Set(['m1', 'note']);
	discard.mockImplementation((id: string) => pending.delete(id));
	readopt.mockResolvedValue(false);
	render(<TaxLocationLockedBridge />);
	await emit(rejection);
	expect([...pending]).toEqual(['note']);
	expect(readopt).toHaveBeenCalledWith(17);
	expect(patchEngineResident).not.toHaveBeenCalled();
	expect(resident.payload.customer_note).toBe('not yet synced');
});
