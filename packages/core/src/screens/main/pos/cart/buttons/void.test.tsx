/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { VoidButton } from './void';

/** Scripted result for one awaitWriteOutcome call, consumed in order. */
type ScriptedOutcome = 'acknowledged' | 'rejected' | 'timeout';

const mockCartLogger = {
	success: jest.fn(),
	error: jest.fn(),
};
const mockRouter = { setParams: jest.fn() };
const mockPatchEngineResident = jest.fn();
const mockPatchAndEnqueueEngineResident = jest.fn();
const mockFindEngineResident = jest.fn();
const mockInsertEngineResident = jest.fn();
let mockOutcomes: ScriptedOutcome[] = [];
let mockConnectivity: 'online' | 'offline' | 'degraded' = 'online';
let mockAwaitCalls: { mutationId: string; timeoutMs?: number }[] = [];

const mockEngine = {
	write: jest.fn(async ({ operation }: { operation: string }) => ({
		mutationId: operation === 'delete' ? 'delete-1' : 'update-1',
		annihilated: false,
	})),
	status: jest.fn(() => ({ connectivity: mockConnectivity })),
};
const mockManager = { engine: mockEngine };
const mockOrderJson: Record<string, unknown> = {
	uuid: 'order-1',
	id: 42,
	number: '42',
	status: 'pos-open',
};
const mockCurrentOrder = {
	uuid: 'order-1',
	payload: mockOrderJson,
	getLatest: () => mockCurrentOrder,
	toMutableJSON: () => ({ payload: { ...mockOrderJson } }),
};

jest.mock('expo-router', () => ({
	useRouter: () => mockRouter,
}));

jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress?: () => void; testID?: string }>) => (
		<button type="button" data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));

jest.mock('@wcpos/query', () => {
	class WriteOutcomeError extends Error {
		eventType: 'write-rejected' | 'write-conflict';
		status?: number;
		reason?: string;

		constructor(reason?: string, status?: number) {
			super(`write-rejected for mutation "delete-1"`);
			this.name = 'WriteOutcomeError';
			this.eventType = 'write-rejected';
			this.status = status;
			this.reason = reason;
		}
	}

	return {
		useQueryRuntime: () => mockManager,
		WriteOutcomeError,
		awaitWriteOutcome: (
			_engine: typeof mockEngine,
			mutationId: string,
			options?: { timeoutMs?: number }
		) => {
			mockAwaitCalls.push({ mutationId, timeoutMs: options?.timeoutMs });
			const next = mockOutcomes.shift() ?? 'acknowledged';
			if (next === 'rejected') {
				return Promise.reject(new WriteOutcomeError('woocommerce_rest_cannot_delete', 403));
			}
			if (next === 'timeout') {
				return Promise.reject(new Error(`Timed out waiting for mutation "${mutationId}"`));
			}
			return Promise.resolve('success');
		},
	};
});

jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
	getLogger: () => ({
		success: (...args: unknown[]) => mockCartLogger.success(...args),
		error: (...args: unknown[]) => mockCartLogger.error(...args),
	}),
}));

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	findEngineResident: (...args: unknown[]) => mockFindEngineResident(...args),
	insertEngineResident: (...args: unknown[]) => mockInsertEngineResident(...args),
	patchEngineResident: (...args: unknown[]) => mockPatchEngineResident(...args),
	patchAndEnqueueEngineResident: (...args: unknown[]) => mockPatchAndEnqueueEngineResident(...args),
}));

jest.mock('../../contexts/current-order', () => ({
	useCurrentOrderRecord: () => mockCurrentOrder,
}));

let mockHeldLeg: { phase: string; row: { id: string; capture_mode: string } } | null = null;
let mockResolveSession: () => Promise<{
	registerId: string | null;
	sessionId: string | null;
}> = async () => ({ registerId: 'till', sessionId: 'session-1' });
jest.mock('../../../../../services/terminal-payments', () => ({
	getTerminalPaymentsService: () => ({ get: () => mockHeldLeg }),
}));

const mockActionLog = jest.fn();
jest.mock('../../hooks/use-action-context', () => ({
	useActionContext: () => ({
		ctx: {
			log: mockActionLog,
			t: (key: string) => key,
			now: Date.now,
			read: { catalog: async () => null },
			register: { resolveSession: () => mockResolveSession() },
			store: { preventOverselling: false },
		},
		actor: { userId: 7, registerId: 'till', sessionId: null },
		cashier: { id: '9', name: 'Demo Cashier' },
	}),
}));

describe('VoidButton', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockOutcomes = [];
		mockAwaitCalls = [];
		mockConnectivity = 'online';
		mockFindEngineResident.mockResolvedValue({});
		mockPatchEngineResident.mockResolvedValue({
			// RxDB returns a *Proxy* from `get()` for object-valued paths, and a Proxy
			// cannot be structured-cloned into the storage worker — the restore must
			// take its payload from `toMutableJSON()`.
			get: () => new Proxy({ status: 'pos-open' }, {}),
			toMutableJSON: () => ({ payload: { status: 'pos-open' } }),
		});
		mockPatchAndEnqueueEngineResident.mockResolvedValue(undefined);
	});

	it('deletes a permitted void without enqueueing an update', async () => {
		mockOutcomes = ['acknowledged'];
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_removed',
				expect.any(Object)
			)
		);
		expect(mockEngine.write).toHaveBeenCalledWith({
			collection: 'orders',
			operation: 'delete',
			recordId: 'order-1',
		});
		expect(mockPatchAndEnqueueEngineResident).not.toHaveBeenCalled();
	});

	it('keeps a refused void pending locally and enqueues the update', async () => {
		mockOutcomes = ['rejected'];
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_voided_kept_pending',
				expect.any(Object)
			)
		);
		expect(mockPatchAndEnqueueEngineResident).toHaveBeenCalledWith({
			manager: mockManager,
			collection: 'orders',
			recordId: 'order-1',
			changes: { status: 'pending' },
		});
	});

	it('converts a refused void while connectivity is degraded — the drain still pushes', async () => {
		mockConnectivity = 'degraded';
		mockOutcomes = ['rejected'];
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_voided_kept_pending',
				expect.any(Object)
			)
		);
		expect(mockPatchAndEnqueueEngineResident).toHaveBeenCalled();
	});

	it('skips the outcome watch entirely when offline (accepted gap)', async () => {
		mockConnectivity = 'offline';
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_removed',
				expect.any(Object)
			)
		);
		expect(mockAwaitCalls).toHaveLength(0);
	});

	it('converts on a refusal that arrives after the helper timeout', async () => {
		mockOutcomes = ['timeout', 'rejected'];
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		// Optimistic toast fires at the timeout, then the late refusal converts.
		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_voided_kept_pending',
				expect.any(Object)
			)
		);
		expect(mockCartLogger.success).toHaveBeenNthCalledWith(
			1,
			'pos_cart.order_removed',
			expect.any(Object)
		);
		expect(mockAwaitCalls).toHaveLength(2);
		expect(mockAwaitCalls[1]?.timeoutMs).toBeGreaterThan(15_000);
		expect(mockPatchAndEnqueueEngineResident).toHaveBeenCalledWith(
			expect.objectContaining({ changes: { status: 'pending' } })
		);
	});

	it('does not convert on a late refusal after the cashier already undid the void', async () => {
		let releaseLateWatch: (() => void) | undefined;
		mockOutcomes = ['timeout'];
		const lateRejection = new Promise<never>((_resolve, reject) => {
			releaseLateWatch = () => {
				const { WriteOutcomeError } = jest.requireMock('@wcpos/query');
				reject(new WriteOutcomeError('woocommerce_rest_cannot_delete', 403));
			};
		});
		// Second call hangs until the undo has run, then rejects with the refusal.
		const query = jest.requireMock('@wcpos/query');
		const original = query.awaitWriteOutcome;
		query.awaitWriteOutcome = jest
			.fn()
			.mockImplementationOnce(original)
			.mockImplementationOnce(() => lateRejection);

		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_removed',
				expect.any(Object)
			)
		);
		const toastOptions = mockCartLogger.success.mock.calls[0][1];
		await toastOptions.toast.action.onClick(); // undo
		releaseLateWatch?.();
		await Promise.resolve();
		await Promise.resolve();

		expect(mockPatchAndEnqueueEngineResident).not.toHaveBeenCalled();
		query.awaitWriteOutcome = original;
	});

	it('surfaces an error toast and no success toast when the delete write fails', async () => {
		mockEngine.write.mockRejectedValueOnce(new Error('delete enqueue failed'));
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.error).toHaveBeenCalledWith('Failed to void order', {
				showToast: true,
				code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
				context: { orderId: 'order-1', error: 'delete enqueue failed' },
			})
		);
		expect(mockCartLogger.success).not.toHaveBeenCalled();
		expect(mockAwaitCalls).toHaveLength(0);
	});

	it('surfaces an error toast and no success toast when the fallback enqueue fails', async () => {
		mockOutcomes = ['rejected'];
		mockPatchAndEnqueueEngineResident.mockRejectedValue(new Error('enqueue failed'));
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.error).toHaveBeenCalledWith('Failed to void order', expect.any(Object))
		);
		expect(mockCartLogger.success).not.toHaveBeenCalled();
	});

	it('reports a failed late conversion as a failed void, after the optimistic toast', async () => {
		mockOutcomes = ['timeout', 'rejected'];
		mockPatchAndEnqueueEngineResident.mockRejectedValueOnce(new Error('resident patch failed'));
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() =>
			expect(mockCartLogger.error).toHaveBeenCalledWith(
				'Failed to void order',
				expect.objectContaining({
					code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
					context: expect.objectContaining({ orderId: 'order-1', error: 'resident patch failed' }),
				})
			)
		);
		expect(mockCartLogger.success).toHaveBeenCalledTimes(1);
		expect(mockCartLogger.success).toHaveBeenCalledWith(
			'pos_cart.order_removed',
			expect.any(Object)
		);
	});

	it('undo of a removed order re-inserts it as a new local order and sends a create', async () => {
		mockFindEngineResident.mockResolvedValue(null);
		mockInsertEngineResident.mockResolvedValue({
			toMutableJSON: () => ({ payload: { ...mockOrderJson, id: 0 } }),
		});
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() => expect(mockCartLogger.success).toHaveBeenCalled());
		mockCartLogger.success.mock.calls[0][1].toast.action.onClick();
		await waitFor(() => expect(mockEngine.write).toHaveBeenCalledTimes(2));

		expect(mockInsertEngineResident).toHaveBeenCalledWith({
			manager: mockManager,
			collection: 'orders',
			recordId: 'order-1',
			payload: { ...mockOrderJson, id: 0 },
		});
		expect(mockEngine.write).toHaveBeenLastCalledWith({
			collection: 'orders',
			operation: 'create',
			recordId: 'order-1',
			payload: { ...mockOrderJson, id: 0 },
		});
		expect(mockPatchEngineResident).not.toHaveBeenCalled();
	});

	it('dispatches cart.order.void with the counted ledger, and the audit row records the outcome', async () => {
		const { registerActionHook } = jest.requireActual<
			typeof import('../../../../../extensions/actions')
		>('../../../../../extensions/actions');
		const seen: unknown[] = [];
		registerActionHook(
			'cart.order.void',
			async (_ctx, e, next) => {
				seen.push(e);
				return next(e);
			},
			{ id: 'test.observer', tier: 'extension', order: 1 }
		);
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));
		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_removed',
				expect.any(Object)
			)
		);
		expect(seen).toEqual([
			expect.objectContaining({
				event: 'cart.order.void',
				orderId: 'order-1',
				source: 'user',
				actor: { userId: 7, registerId: 'till', sessionId: null },
				payload: {
					orderId: 42,
					orderNumber: '42',
					status: 'pos-open',
					registerId: null,
					sessionId: 'session-1',
					actor: { id: '9', name: 'Demo Cashier' },
					paymentLegs: { live: 0, captured: 0, device: 0 },
				},
			}),
		]);
		expect(mockActionLog).toHaveBeenCalledWith(
			'info',
			'Order order-1 voided',
			expect.objectContaining({
				category: ['wcpos', 'pos', 'cart', 'void'],
				actor: { id: '9', name: 'Demo Cashier' },
				context: expect.objectContaining({
					type: 'order.voided',
					orderId: 42,
					orderUUID: 'order-1',
					outcome: 'removed',
					sessionId: 'session-1',
				}),
			})
		);
	});

	it('refuses a void while the order carries a captured payment leg: nothing is deleted', async () => {
		const { withLedger } =
			jest.requireActual<typeof import('@wcpos/order-math')>('@wcpos/order-math');
		mockOrderJson.meta_data = withLedger(
			[],
			[
				{
					id: 'leg',
					source: 'app',
					order_id: 42,
					method_id: 'pos_cash',
					provider: 'manual',
					kind: 'cash',
					capture_mode: 'manual',
					transport: null,
					recorded_offline: false,
					amount: '10.00',
					currency: 'AUD',
					tendered: null,
					status: 'captured',
					captured_at_gmt: '2026-10-12T00:00:00Z',
					session_id: null,
					register_id: null,
				} as never,
			]
		);
		try {
			render(<VoidButton />);
			fireEvent.click(screen.getByTestId('void-button'));
			await waitFor(() =>
				expect(mockActionLog).toHaveBeenCalledWith(
					'warn',
					'pos_cart.void_payments_first',
					expect.objectContaining({
						showToast: true,
						context: expect.objectContaining({ captured: 1 }),
					})
				)
			);
			expect(mockEngine.write).not.toHaveBeenCalled();
			expect(mockCartLogger.success).not.toHaveBeenCalled();
			expect(mockPatchAndEnqueueEngineResident).not.toHaveBeenCalled();
			// A refused void is no void: no audit row.
			expect(mockActionLog).not.toHaveBeenCalledWith('info', expect.anything(), expect.anything());
		} finally {
			delete mockOrderJson.meta_data;
		}
	});

	it('counts the ledger inside the queue slot: a leg landed by a write queued ahead refuses the void', async () => {
		const { withLedger } =
			jest.requireActual<typeof import('@wcpos/order-math')>('@wcpos/order-math');
		const { enqueueOrderMutation } = jest.requireActual<
			typeof import('../../hooks/order-mutation-queue')
		>('../../hooks/order-mutation-queue');
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		void enqueueOrderMutation('order-1', async () => {
			await gate;
			mockOrderJson.meta_data = withLedger(
				[],
				[
					{
						id: 'leg',
						source: 'app',
						order_id: 42,
						method_id: 'pos_cash',
						provider: 'manual',
						kind: 'cash',
						capture_mode: 'manual',
						transport: null,
						recorded_offline: false,
						amount: '10.00',
						currency: 'AUD',
						tendered: null,
						status: 'captured',
						captured_at_gmt: '2026-10-12T00:00:00Z',
						session_id: null,
						register_id: null,
					} as never,
				]
			);
		});
		try {
			render(<VoidButton />);
			fireEvent.click(screen.getByTestId('void-button'));
			release();
			await waitFor(() =>
				expect(mockActionLog).toHaveBeenCalledWith(
					'warn',
					'pos_cart.void_payments_first',
					expect.objectContaining({ showToast: true })
				)
			);
			expect(mockEngine.write).not.toHaveBeenCalled();
		} finally {
			delete mockOrderJson.meta_data;
		}
	});

	it('a card leg the terminal service still holds counts as live and refuses the void', async () => {
		mockHeldLeg = { phase: 'polling', row: { id: 'held-leg', capture_mode: 'device' } };
		try {
			render(<VoidButton />);
			fireEvent.click(screen.getByTestId('void-button'));
			await waitFor(() =>
				expect(mockActionLog).toHaveBeenCalledWith(
					'warn',
					'pos_cart.void_payments_first',
					expect.objectContaining({ context: expect.objectContaining({ live: 1 }) })
				)
			);
			expect(mockEngine.write).not.toHaveBeenCalled();
		} finally {
			mockHeldLeg = null;
		}
	});

	it('a held leg the ledger already shows is counted once', async () => {
		const { withLedger } =
			jest.requireActual<typeof import('@wcpos/order-math')>('@wcpos/order-math');
		mockHeldLeg = { phase: 'polling', row: { id: 'held-leg', capture_mode: 'device' } };
		mockOrderJson.meta_data = withLedger(
			[],
			[
				{
					id: 'held-leg',
					source: 'app',
					order_id: 42,
					method_id: 'stripe_terminal',
					provider: 'stripe',
					kind: 'card',
					capture_mode: 'device',
					transport: 'bluetooth',
					recorded_offline: false,
					amount: '10.00',
					currency: 'AUD',
					tendered: null,
					status: 'pending',
					captured_at_gmt: null,
					session_id: null,
					register_id: null,
				} as never,
			]
		);
		try {
			render(<VoidButton />);
			fireEvent.click(screen.getByTestId('void-button'));
			await waitFor(() =>
				expect(mockActionLog).toHaveBeenCalledWith(
					'warn',
					'pos_cart.void_payments_first',
					expect.objectContaining({ context: expect.objectContaining({ live: 1, captured: 0 }) })
				)
			);
		} finally {
			mockHeldLeg = null;
			delete mockOrderJson.meta_data;
		}
	});

	it('a late refusal that keeps the order writes a correcting audit row', async () => {
		mockOutcomes = ['timeout', 'rejected'];
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));
		await waitFor(() =>
			expect(mockCartLogger.success).toHaveBeenCalledWith(
				'pos_cart.order_voided_kept_pending',
				expect.any(Object)
			)
		);
		const rows = mockActionLog.mock.calls.filter(
			([level, , options]) => level === 'info' && options?.context?.type === 'order.voided'
		);
		expect(rows.map(([, , options]) => options.context.outcome)).toEqual([
			'removed',
			'kept-pending',
		]);
		expect(rows[1][2].context).toEqual(
			expect.objectContaining({ late: true, status: 'pending', sessionId: 'session-1' })
		);
		expect(rows[1][2].actor).toEqual({ id: '9', name: 'Demo Cashier' });
	});

	it('voids an unpaid order with sessions on and none open: the row carries no session', async () => {
		const { RegisterSessionRequiredError } = jest.requireActual<
			typeof import('../../../../../services/register-session/session-store')
		>('../../../../../services/register-session/session-store');
		mockResolveSession = async () => {
			throw new RegisterSessionRequiredError();
		};
		try {
			render(<VoidButton />);
			fireEvent.click(screen.getByTestId('void-button'));
			await waitFor(() =>
				expect(mockCartLogger.success).toHaveBeenCalledWith(
					'pos_cart.order_removed',
					expect.any(Object)
				)
			);
			expect(mockCartLogger.error).not.toHaveBeenCalled();
			expect(mockActionLog).toHaveBeenCalledWith(
				'info',
				expect.stringContaining('voided'),
				expect.objectContaining({ context: expect.objectContaining({ sessionId: null }) })
			);
		} finally {
			mockResolveSession = async () => ({ registerId: 'till', sessionId: 'session-1' });
		}
	});

	it('refuses to void at all when the payments gate is not registered', async () => {
		const { resetActionRegistry } = jest.requireActual<
			typeof import('../../../../../extensions/actions')
		>('../../../../../extensions/actions');
		resetActionRegistry();
		try {
			render(<VoidButton />);
			fireEvent.click(screen.getByTestId('void-button'));
			await waitFor(() =>
				expect(mockActionLog).toHaveBeenCalledWith(
					'warn',
					'actions.guard_missing',
					expect.objectContaining({ showToast: true })
				)
			);
			expect(mockEngine.write).not.toHaveBeenCalled();
		} finally {
			// Re-register the gate and the audit hook, on the real registry, for the cases after this.
			const { registerActionHook, ORDER_VOID_EVENT } = jest.requireActual<
				typeof import('../../../../../extensions/actions')
			>('../../../../../extensions/actions');
			const { paymentsGate } =
				jest.requireActual<typeof import('../void-guards')>('../void-guards');
			const { auditOrderVoided } =
				jest.requireActual<typeof import('../void-audit-hook')>('../void-audit-hook');
			registerActionHook(ORDER_VOID_EVENT, paymentsGate, {
				id: 'payments.gate',
				tier: 'guard',
				order: 0,
			});
			registerActionHook(ORDER_VOID_EVENT, auditOrderVoided, {
				id: 'audit.order-voided',
				tier: 'extension',
				order: 0,
			});
		}
	});

	it('undo after fallback restores pos-open and enqueues an update', async () => {
		mockOutcomes = ['rejected'];
		render(<VoidButton />);
		fireEvent.click(screen.getByTestId('void-button'));

		await waitFor(() => expect(mockCartLogger.success).toHaveBeenCalled());
		const toastOptions = mockCartLogger.success.mock.calls[0][1];
		toastOptions.toast.action.onClick();
		await waitFor(() => expect(mockEngine.write).toHaveBeenCalledTimes(2));

		expect(mockPatchEngineResident).toHaveBeenLastCalledWith({
			manager: mockManager,
			collection: 'orders',
			recordId: 'order-1',
			changes: mockOrderJson,
		});
		expect(mockEngine.write).toHaveBeenLastCalledWith({
			collection: 'orders',
			operation: 'update',
			recordId: 'order-1',
			payload: { status: 'pos-open' },
		});
	});
});

jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ site: { uuid: 'site' }, store: { id: 1 } }),
}));

it('stamps the original register through the real writer when binding switches during the outcome wait', async () => {
	const query = jest.requireMock('@wcpos/query');
	const realQuery = jest.requireActual('@wcpos/query');
	for (const key of [
		'COLLECTION_VOCABULARY',
		'adapterDerivedFieldsFor',
		'promotedColumnsFor',
		'engineCollection',
	])
		query[key] = realQuery[key];
	const { patchAndEnqueueEngineResident } = jest.requireActual(
		'../../../hooks/mutations/use-local-mutation'
	);
	const { readBoundRegister } = jest.requireActual(
		'../../../../../services/register/register-document'
	);
	await readBoundRegister(
		{
			getLocal: async () => ({
				toJSON: () => ({
					data: { id: 'till', sites: { site: { register_id: 'register', register_store_id: 1 } } },
				}),
			}),
		} as never,
		'site',
		1
	);
	const stored = { payload: { status: 'pos-open' } };
	const resident = {
		toJSON: () => stored,
		incrementalModify: async (modify: (old: typeof stored) => typeof stored) =>
			Object.assign(stored, modify(stored)),
	};
	const manager = {
		engine: {
			whenActive: async () => ({
				scopeId: 'scope',
				barcodeSelectors: {},
				database: { collections: { orders: { findOne: () => ({ exec: async () => resident }) } } },
			}),
			status: () => ({ activeScopeId: 'scope' }),
			write: mockEngine.write,
		},
	};
	jest.clearAllMocks();
	mockOutcomes = ['rejected'];
	mockConnectivity = 'online';
	mockFindEngineResident.mockResolvedValue({});
	mockPatchAndEnqueueEngineResident.mockImplementationOnce((input) =>
		patchAndEnqueueEngineResident({ ...input, manager })
	);
	let refuse!: () => void;
	const outcome = jest.spyOn(query, 'awaitWriteOutcome').mockImplementationOnce(
		() =>
			new Promise((_resolve, reject) => {
				refuse = () => reject(new query.WriteOutcomeError('woocommerce_rest_cannot_delete', 403));
			})
	);
	render(<VoidButton />);
	fireEvent.click(screen.getByTestId('void-button'));
	await waitFor(() => expect(outcome).toHaveBeenCalled());
	await readBoundRegister(
		{
			getLocal: async () => ({
				toJSON: () => ({
					data: {
						id: 'till',
						sites: { site: { register_id: 'new-register', register_store_id: 2 } },
					},
				}),
			}),
		} as never,
		'site',
		2
	);
	refuse();
	await waitFor(() =>
		expect(mockEngine.write).toHaveBeenCalledWith(
			expect.objectContaining({
				payload: {
					status: 'pending',
					meta_data: [
						{ key: '_wcpos_register', value: 'register' },
						{ key: '_wcpos_till', value: 'till' },
					],
				},
			})
		)
	);
	outcome.mockRestore();
});

jest.mock('../../contexts/current-order/temporary-order', () => ({}));

jest.mock('../../../../../hooks/use-local-date', () => ({}));

it('closes the sheet synchronously before starting the existing void flow', async () => {
	const before = jest.fn(() => expect(mockEngine.write).not.toHaveBeenCalled());
	mockEngine.write.mockClear();
	render(<VoidButton onBeforeVoid={before} />);
	fireEvent.click(screen.getByTestId('void-button'));
	expect(before).toHaveBeenCalledTimes(1);
	// The delete follows the order's queue slot and the gate, so it lands a tick later.
	await waitFor(() => expect(mockEngine.write).toHaveBeenCalled());
});
