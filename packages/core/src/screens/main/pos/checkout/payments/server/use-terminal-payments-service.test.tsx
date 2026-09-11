/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { withLedger } from '@wcpos/order-math';

import { useTerminalPaymentsService } from './use-terminal-payments-service';
import {
	getTerminalPaymentsService,
	stopTerminalPaymentsService,
} from '../../../../../../services/terminal-payments';
import { row } from '../device/fixtures.test-utils';

const mockStore = { id: 1, price_num_decimals: 2 };
const mockSite = {};
const mockRow = {
	...row,
	recorded_offline: true,
	status: 'authorized' as const,
	provider_refs: { payment_intent: 'settled_pi' },
};
const mockResident = {
	uuid: 'completed-order',
	payload: {
		id: 42,
		number: '42',
		total: '10.00',
		status: 'completed',
		meta_data: withLedger([{ key: '_wcpos_sale_counter', value: '1' }], [mockRow]),
	},
};
const mockDocuments = new BehaviorSubject([mockResident]);
const mockFind = jest.fn(() => ({ $: mockDocuments }));
const mockRuntime = {
	engine: {
		db$: (listener: (db: object) => void) => {
			listener({});
			return () => {};
		},
	},
};
const mockHttp = {
	get: jest.fn(),
	post: jest.fn(async () => ({
		data: {
			payment: { ...mockRow, status: 'captured', amount: '11.00', tip: '1.00' },
			order: {
				status: 'completed',
				total: '11.00',
				paid: '11.00',
				balance: '0',
				payment_method: 'device',
				payment_method_title: 'Reader',
			},
		},
	})),
};
const mockMirror = jest.fn(async (_input: unknown) => {});
const mockPatch = jest.fn(async () => ({}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => mockRuntime,
	engineCollection: () => ({ find: mockFind }),
}));
jest.mock('../../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: mockStore, site: mockSite }),
}));
jest.mock('../../../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => mockHttp }));
jest.mock('../../../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ methods: [] }),
}));
jest.mock('../../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockPatch }),
	findEngineResident: async () => mockResident,
	patchEngineResident: (input: unknown) => mockMirror(input),
}));
afterEach(() => {
	stopTerminalPaymentsService();
	jest.clearAllMocks();
});
it('recovers a completed resident offline authorization without any open checkout or live leg', async () => {
	const hook = renderHook(() => useTerminalPaymentsService());
	await waitFor(() =>
		expect(mockHttp.post).toHaveBeenCalledWith('orders/42/payments/leg/capture', {
			context: { provider_refs: { payment_intent: 'settled_pi' } },
		})
	);
	expect(mockFind).toHaveBeenCalledWith({
		selector: {
			'payload.meta_data': {
				$elemMatch: {
					key: '_wcpos_payments',
					'value.payments': {
						$elemMatch: { capture_mode: 'device', recorded_offline: true, status: 'authorized' },
					},
				},
			},
		},
	});
	expect(getTerminalPaymentsService()?.get('completed-order')).toBeNull();
	expect(mockMirror).toHaveBeenCalledWith(
		expect.objectContaining({ changes: expect.objectContaining({ total: '11.00' }) })
	);
	expect(mockPatch).not.toHaveBeenCalled(); // Already-persisted refs are not re-enqueued.
	hook.unmount();
});

jest.mock('../../provenance/stamp-completion', () => ({
	completionMeta: async ({ meta_data }: { meta_data: unknown[] }) => [
		...meta_data,
		{ key: '_wcpos_sale_counter', value: '2' },
	],
}));
it('offline settlement puts the tuple and ledger in the same completing patch', async () => {
	const original = mockResident.payload.meta_data;
	mockResident.payload.meta_data = withLedger([], []);
	const start = jest.spyOn(
		await import('../../../../../../services/terminal-payments'),
		'startTerminalPaymentsService'
	);
	const hook = renderHook(() => useTerminalPaymentsService());
	try {
		const options = start.mock.calls[0][0];
		await options.patchAndEnqueue!('completed-order', { ...mockRow, status: 'captured' });
		expect(mockPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				data: {
					status: 'completed',
					meta_data: expect.arrayContaining([
						{ key: '_wcpos_sale_counter', value: '2' },
						expect.objectContaining({ key: '_wcpos_payments' }),
					]),
				},
			})
		);
	} finally {
		hook.unmount();
		start.mockRestore();
		mockResident.payload.meta_data = original;
	}
});

it('background terminal settlement enqueues one provenance-only patch after mirroring', async () => {
	const original = mockResident.payload.meta_data;
	mockResident.payload.meta_data = withLedger([], [mockRow]);
	const hook = renderHook(() => useTerminalPaymentsService());
	try {
		await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
		expect(mockMirror).toHaveBeenCalledTimes(1);
		expect(mockPatch).toHaveBeenCalledWith({
			document: mockResident,
			data: {
				meta_data: expect.arrayContaining([{ key: '_wcpos_sale_counter', value: '2' }]),
			},
		});
	} finally {
		hook.unmount();
		mockResident.payload.meta_data = original;
	}
});

const mockMirrorError = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ error: (...args: unknown[]) => mockMirrorError(...args), warn: jest.fn() }),
	getErrorMessage: String,
}));
it('reports a falsy terminal provenance patch without rejecting the recorded payment', async () => {
	const original = mockResident.payload.meta_data;
	mockResident.payload.meta_data = withLedger([], [mockRow]);
	mockPatch.mockResolvedValueOnce(undefined as never);
	const hook = renderHook(() => useTerminalPaymentsService());
	try {
		await waitFor(() =>
			expect(mockMirrorError).toHaveBeenCalledWith(
				'Checkout failed',
				expect.objectContaining({ code: 'CHECKOUT101', showToast: true })
			)
		);
		expect(getTerminalPaymentsService()?.get('completed-order')).toBeNull();
	} finally {
		hook.unmount();
		mockResident.payload.meta_data = original;
	}
});

it.each(['ledger', 'provenance'] as const)(
	'preserves the rejection contract for a failed %s patch',
	async (failure) => {
		const original = mockResident.payload.meta_data;
		mockResident.payload.meta_data = [];
		const start = jest.spyOn(
			await import('../../../../../../services/terminal-payments'),
			'startTerminalPaymentsService'
		);
		const error = new Error(`${failure} write failed`);
		if (failure === 'ledger') mockMirror.mockRejectedValueOnce(error);
		else mockPatch.mockRejectedValueOnce(error);
		const hook = renderHook(() => useTerminalPaymentsService());
		try {
			const result = start.mock.calls[0][0].mirror('completed-order', {
				payment: { ...mockRow, status: 'captured' },
				order: {
					status: 'completed',
					total: '10.00',
					paid: '10.00',
					balance: '0.00',
					payment_method: 'device',
					payment_method_title: 'Reader',
				},
			});
			if (failure === 'ledger') {
				await expect(result).rejects.toBe(error);
				expect(mockPatch).not.toHaveBeenCalled();
			} else {
				await expect(result).resolves.toBeUndefined();
				expect(mockMirrorError).toHaveBeenCalledWith(
					'Checkout failed',
					expect.objectContaining({
						context: { error: String(error) },
					})
				);
			}
		} finally {
			hook.unmount();
			start.mockRestore();
			mockResident.payload.meta_data = original;
		}
	}
);
