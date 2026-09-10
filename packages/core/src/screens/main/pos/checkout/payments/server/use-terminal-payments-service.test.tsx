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
		meta_data: withLedger([], [mockRow]),
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
