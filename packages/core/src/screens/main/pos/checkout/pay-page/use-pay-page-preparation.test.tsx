/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject, map, take } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';
import { recordCompletionAttempt } from '@wcpos/query/store-local';

import { commitGatewaySale } from '../commit-gateway-sale';
import { persistSaleProvenance } from '../sale-completion';
import { usePayPagePreparation } from './use-pay-page-preparation';

// The one integration suite of the pay page by design: the real commitGatewaySale path,
// its gates and its journal, against stubbed storage. Moved from payment-webview.test.tsx;
// there a shown URL mounted the frame (`webViewMounts`), and a failed preparation reported
// `stalled` through the frame (`usePayFrame`'s re-gate), a pending one `loading`.
const mockLocalPatch = jest.fn();
const mockPushDocument = jest.fn();
const mockStockAdjustment = jest.fn();
const mockEngineRequire = jest.fn();
const mockUserDB = {};
const mockSite = { uuid: 'site', wcpos_api_url: 'https://shop.example.com/wp-json/wcpos/v2/' };
let mockOnlineStatus = 'offline';
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockOnlineStatus }),
}));
jest.mock('@wcpos/query', () => ({
	// pushFailureCode tests these with instanceof and reads `status`.
	WriteDeferredError: class WriteDeferredError extends Error {
		status?: number;
		constructor(mutationId: string, status?: number) {
			super(`write-deferred (${status}) for mutation "${mutationId}"`);
			this.status = status;
		}
	},
	WriteOutcomeError: class WriteOutcomeError extends Error {},
}));
let mockRegisterId: string | null = null;
let mockBindingStatus: 'bound' | 'choose' | 'none' | 'unknown' = 'bound';
jest.mock('../../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({
		status: mockBindingStatus,
		registerId: mockRegisterId,
		registerName: null,
		registers: [],
		bind: jest.fn(),
	}),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ userDB: mockUserDB, site: mockSite, store: { id: 1 } }),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

jest.mock('../sale-completion', () => {
	const actual = jest.requireActual<typeof import('../sale-completion')>('../sale-completion');
	const { withMetaReplaced } =
		jest.requireActual<typeof import('@wcpos/order-math')>('@wcpos/order-math');
	const completionMetaFor = jest.fn<
		ReturnType<typeof actual.completionMetaFor>,
		Parameters<typeof actual.completionMetaFor>
	>();
	completionMetaFor.mockImplementation(async (_ctx, meta, facts) =>
		withMetaReplaced(meta, [{ key: '_wcpos_sale_counter', value: '1' }, ...(facts.extraMeta ?? [])])
	);
	return {
		...actual,
		completionMetaFor,
		persistSaleProvenance: jest.fn(
			async (
				ctx: import('../sale-completion').SaleContext,
				input: Parameters<typeof actual.persistSaleProvenance>[1]
			) => {
				const meta_data = input.online
					? await completionMetaFor(ctx, input.order.getLatest().payload.meta_data, input)
					: withMetaReplaced(input.order.getLatest().payload.meta_data, input.extraMeta ?? []);
				if (!input.online && !input.extraMeta) return;
				if (!(await ctx.stampCompletion(input.order, meta_data)))
					throw new Error('provenance_save_failed');
				if (input.online) await ctx.pushDocument(input.order);
			}
		),
	};
});

jest.mock('../commit-gateway-sale', () => {
	const actual =
		jest.requireActual<typeof import('../commit-gateway-sale')>('../commit-gateway-sale');
	return { ...actual, commitGatewaySale: jest.fn(actual.commitGatewaySale) };
});

// Journal storage is exercised against RxDB in the owner/journal suites.
jest.mock('@wcpos/query/store-local', () => ({
	...jest.requireActual('@wcpos/query/store-local'),
	recordCompletionAttempt: jest.fn(async () => {}),
	resolveCompletionAttempt: jest.fn(async () => {}),
	failCompletionAttempt: jest.fn(async () => {}),
}));

const mockRegisterDB = {
	getLocal: async () =>
		mockRegisterId
			? {
					toJSON: () => ({
						data: { sites: { site: { register_id: mockRegisterId, register_store_id: 1 } } },
					}),
				}
			: null,
};
let mockSessionsOn = false;
const mockOpenSession = new BehaviorSubject<{ id: string; status?: string } | null>(null);
const mockSessions = { findOne: jest.fn() };
const mockSessionStoreDB = { collections: { register_sessions: mockSessions } };

// The sale context the component reads from useSaleContext, as that suite's mock built it.
const makeCtx = () =>
	({
		actionActor: { userId: 7, registerId: mockRegisterId, sessionId: null },
		actionCtx: jest
			.requireActual<typeof import('../../../../../extensions/actions')>(
				'../../../../../extensions/actions'
			)
			.createActionContext({
				log: () => undefined,
				t: (key) => key,
				readCatalog: async () => null,
				readPaymentMethod: () => null,
				preventOverselling: false,
				priceDecimals: 2,
				// The session gate reads the bound register and its open session the way the app does.
				resolveSession: async () => {
					const { readBoundRegister } = jest.requireActual<
						typeof import('@wcpos/query/register-session')
					>('@wcpos/query/register-session');
					const { findOpenSession } = jest.requireActual<
						typeof import('@wcpos/query/register-session')
					>('@wcpos/query/register-session');
					const registerId =
						(await readBoundRegister(mockRegisterDB as never, 'site', 1))?.id ?? null;
					const session = await findOpenSession(
						{ collections: { register_sessions: mockSessions } },
						registerId,
						mockSessionsOn
					);
					return { registerId, sessionId: session?.id ?? null };
				},
			}),
		userDB: mockRegisterDB,
		sessionsOn: mockSessionsOn,
		storeDB: mockSessionStoreDB,
		siteUuid: 'site',
		storeId: 1,
		runtime: { engine: { require: mockEngineRequire } },
		dp: 2,
		stampCompletion: (
			...[o, m]: Parameters<import('../sale-completion').SaleContext['stampCompletion']>
		) => mockLocalPatch({ document: o, data: { meta_data: m } }),
		pushDocument: mockPushDocument,
		stockAdjustment: mockStockAdjustment,
	}) as never;

type Order = { uuid: string; payload: { links: { payment: { href: string }[] } } };
const makeOrder = (
	href = 'https://shop.example.com/wcpos-checkout/order-pay/42',
	meta_data: { key: string; value: string }[] = []
) => {
	const order = {
		uuid: 'uuid-42',
		payload: {
			id: 42,
			number: '42',
			status: 'pos-open',
			links: { payment: [{ href }] },
			line_items: [],
			meta_data,
		},
		getLatest: () => order,
	};
	return order as never;
};

const logger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);
// Committed mounts of the frame: a URL that appears (again) is one more mount.
let webViewMounts = 0;
interface Props {
	order: never;
	settledOrderStatuses?: Record<string, string | null>;
	retryToken?: number;
}
const renderPreparation = (initialProps: Props) =>
	renderHook(
		(props: Props) => {
			const settledRef = React.useRef(props.settledOrderStatuses ?? {});
			const preparation = usePayPagePreparation({
				order: props.order,
				ctx: makeCtx(),
				rawPaymentURL: (props.order as Order).payload.links.payment[0].href,
				retryToken: props.retryToken ?? 0,
				settledRef,
				logger,
			});
			const shown = !!preparation.paymentURL;
			React.useEffect(() => {
				if (shown) webViewMounts += 1;
			}, [shown]);
			return preparation;
		},
		{ initialProps }
	);

type SessionFixture = {
	id: string;
	register_id: string;
	status: string;
	sync_status: string;
	incrementalPatch: () => Promise<void>;
};
function observeSessions(rows: BehaviorSubject<SessionFixture[]>) {
	mockSessions.findOne.mockImplementation(
		(query: string | { selector: Record<string, unknown> }) => {
			const selector = typeof query === 'string' ? { id: query } : query.selector;
			const selected = rows.pipe(
				map(
					(values) =>
						values.find((row) =>
							Object.entries(selector).every(([key, value]) => {
								const actual = row[key as keyof SessionFixture];
								return typeof value === 'object' && value !== null && '$ne' in value
									? actual !== value.$ne
									: actual === value;
							})
						) ?? null
				)
			);
			return {
				$: selected,
				exec: async () => new Promise((resolve) => selected.pipe(take(1)).subscribe(resolve)),
			};
		}
	);
}

it("journals the whole stored-status catalog at commit, not the opened gateway's entry", async () => {
	// The commit runs before the pay page opens, so the order still carries the gateway
	// the sale was OPENED with (pos_cash here); the pay page can settle through another
	// (bacs). Replay looks the status up for the gateway the resident order comes back
	// carrying, so the journal must hold every gateway's entry (#2475 review).
	jest.clearAllMocks();
	mockOnlineStatus = 'online-website-available';
	const order = makeOrder();
	(order as unknown as { payload: Record<string, unknown> }).payload.payment_method = 'pos_cash';
	mockLocalPatch.mockResolvedValue(order);
	mockPushDocument.mockResolvedValue(undefined);
	const catalog = { pos_cash: null, bacs: 'pending' };

	renderPreparation({ order, settledOrderStatuses: catalog });

	await waitFor(() => expect(recordCompletionAttempt).toHaveBeenCalledTimes(1));
	const [, facts] = jest.mocked(recordCompletionAttempt).mock.calls[0];
	expect(facts).toMatchObject({
		orderUuid: 'uuid-42',
		source: 'gateway-snapshot',
		settledOrderStatuses: catalog,
	});
	expect(facts).not.toHaveProperty('settledOrderStatus');
});

it.each([false, true])(
	'awaits provenance before opening online webview (save fails: %s)',
	async (fails) => {
		jest.clearAllMocks();
		mockOnlineStatus = 'online-website-available';
		webViewMounts = 0;
		const order = makeOrder();
		mockLocalPatch.mockResolvedValue(order);
		let finish!: () => void;
		mockPushDocument.mockImplementationOnce(
			() =>
				new Promise<void>((resolve, reject) => {
					finish = () => (fails ? reject(new Error('save failed')) : resolve());
				})
		);
		const view = renderPreparation({ order });
		try {
			await act(async () => {});
			expect(mockLocalPatch).toHaveBeenLastCalledWith({
				document: order,
				data: { meta_data: [{ key: '_wcpos_sale_counter', value: '1' }] },
			});
			expect(mockPushDocument).toHaveBeenLastCalledWith(order);
			expect(jest.mocked(recordCompletionAttempt).mock.invocationCallOrder[0]).toBeLessThan(
				mockLocalPatch.mock.invocationCallOrder[0]
			);
			expect(webViewMounts).toBe(0);
			await act(async () => finish());
			expect(webViewMounts).toBe(fails ? 0 : 1);
			expect(mockPushDocument).toHaveBeenCalledTimes(1);
			if (fails) {
				mockOnlineStatus = 'offline';
				view.rerender({ order });
				expect(webViewMounts).toBe(0);
			}
		} finally {
			view.unmount();
			mockOnlineStatus = 'offline';
		}
	}
);

// usePushDocument reports nothing: the pay-page preparation is the one report, and a refused
// session behind the provenance push keeps its AUTH101 instead of the generic checkout code.
it('reports a provenance push refused for the session once, as AUTH101', async () => {
	jest.clearAllMocks();
	mockOnlineStatus = 'online-website-available';
	const order = makeOrder();
	mockLocalPatch.mockResolvedValue(order);
	const { WriteDeferredError } = jest.requireMock('@wcpos/query');
	mockPushDocument.mockRejectedValueOnce(new WriteDeferredError('mutation-1', 401));
	const view = renderPreparation({ order });
	try {
		await act(async () => {});
		const checkoutFailures = jest
			.mocked(logger.error)
			.mock.calls.filter(([message]) => message === 'Checkout failed');
		expect(checkoutFailures).toHaveLength(1);
		expect(checkoutFailures[0][1]).toEqual(expect.objectContaining({ code: 'AUTH101' }));
	} finally {
		view.unmount();
		mockOnlineStatus = 'offline';
	}
});

describe('usePayPagePreparation register gate', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockOnlineStatus = 'online-website-available';
		mockLocalPatch.mockResolvedValue(true);
	});
	afterEach(() => {
		mockBindingStatus = 'bound';
		mockOnlineStatus = 'offline';
	});
	it('does not expose the pay page while a register is still to be chosen', async () => {
		mockBindingStatus = 'choose';
		const { result } = renderPreparation({ order: makeOrder(), retryToken: 0 });
		await waitFor(() => expect(result.current.prepared).toBe('failed'));
		// The pay page completes the whole balance: no provenance write, no URL.
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(result.current.paymentURL).toBeUndefined();
	});
});

describe('pay-page session gate', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.mocked(recordCompletionAttempt).mockReset().mockResolvedValue(undefined);
		mockSessionsOn = true;
		mockOnlineStatus = 'online-website-available';
		webViewMounts = 0;
		mockLocalPatch.mockResolvedValue(true);
		mockOpenSession.next(null);
		mockSessions.findOne.mockReturnValue({ exec: async () => null, $: mockOpenSession });
		jest
			.mocked(persistSaleProvenance)
			.mockImplementation(jest.requireActual('../sale-completion').persistSaleProvenance);
	});
	afterEach(() => {
		mockSessionsOn = false;
		mockRegisterId = null;
		mockOnlineStatus = 'offline';
		jest.mocked(persistSaleProvenance).mockReset();
	});
	it('sync rejection hides and stalls ready A once, then re-prepares and stamps B', async () => {
		mockRegisterId = 'register-A';
		const sessionA = {
			id: 'session-A',
			register_id: 'register-A',
			status: 'open',
			sync_status: 'pending',
			incrementalPatch: async () => undefined,
		};
		const rows = new BehaviorSubject<SessionFixture[]>([sessionA]);
		observeSessions(rows);
		const view = renderPreparation({
			order: makeOrder(undefined, [{ key: '_wcpos_sale_counter', value: '7' }]),
		});
		await act(async () => {});
		expect(view.result.current.prepared).toBe('ready');
		mockLocalPatch.mockClear();
		await act(async () => rows.next([{ ...sessionA, sync_status: 'failed' }]));
		expect(view.result.current.paymentURL).toBeUndefined();
		expect(view.result.current.prepared).toBe('failed');
		await act(async () => rows.next([{ ...sessionA, sync_status: 'failed' }]));
		expect(logger.info).toHaveBeenCalledTimes(1);
		expect(logger.info).toHaveBeenCalledWith(
			'pos_checkout.open_register_first',
			expect.objectContaining({ showToast: true })
		);
		expect(mockLocalPatch).not.toHaveBeenCalled();
		await act(async () =>
			rows.next([...rows.value, { ...sessionA, id: 'session-B', sync_status: 'synced' }])
		);
		expect(commitGatewaySale).toHaveBeenCalledTimes(2);
		expect(mockLocalPatch.mock.calls[0][0].data.meta_data).toContainEqual({
			key: '_wcpos_session',
			value: 'session-B',
		});
		expect(view.result.current.paymentURL).toContain('/order-pay/42');
		expect(logger.info).toHaveBeenCalledTimes(1);
		view.unmount();
		expect(rows.observed).toBe(false);
	});
	it.each([false, true])(
		'switching bound A to B invalidates A before preparing B (open: %s)',
		async (open) => {
			mockRegisterId = 'register-A';
			const sessionA = {
				id: 'session-A',
				register_id: 'register-A',
				status: 'open',
				sync_status: 'synced',
				incrementalPatch: async () => undefined,
			};
			const sessionB = { ...sessionA, id: 'session-B', register_id: 'register-B' };
			const rows = new BehaviorSubject<SessionFixture[]>(open ? [sessionA, sessionB] : [sessionA]);
			observeSessions(rows);
			const props = {
				order: makeOrder(undefined, [{ key: '_wcpos_sale_counter', value: '7' }]),
			};
			const view = renderPreparation(props);
			await act(async () => {});
			expect(view.result.current.prepared).toBe('ready');
			mockLocalPatch.mockClear();
			let finish!: () => void;
			const pending = new Promise<void>((resolve) => {
				finish = resolve;
			});
			jest.mocked(recordCompletionAttempt).mockReturnValueOnce(pending);
			mockRegisterId = 'register-B';
			view.rerender(props);
			expect(view.result.current.paymentURL).toBeUndefined();
			expect(view.result.current.prepared).toBeNull();
			await act(async () => {});
			if (!open) {
				expect(view.result.current.prepared).toBe('failed');
				expect(logger.info).toHaveBeenCalledTimes(1);
				expect(logger.info).toHaveBeenCalledWith(
					'pos_checkout.open_register_first',
					expect.objectContaining({ showToast: true })
				);
				expect(mockLocalPatch).not.toHaveBeenCalled();
				await act(async () => rows.next([sessionA, sessionB]));
			}
			expect(view.result.current.paymentURL).toBeUndefined();
			await act(async () => finish());
			expect(commitGatewaySale).toHaveBeenCalledTimes(open ? 2 : 3);
			expect(mockLocalPatch.mock.calls[0][0].data.meta_data).toContainEqual({
				key: '_wcpos_session',
				value: 'session-B',
			});
			expect(view.result.current.paymentURL).toContain('/order-pay/42');
			expect(logger.info).toHaveBeenCalledTimes(open ? 0 : 1);
			view.unmount();
			expect(rows.observed).toBe(false);
		}
	);
	it.each(['counting', 'closed', 'missing'])(
		'ready session A becomes %s: hides and stalls once, then re-prepares in B',
		async (status) => {
			const sessionA = { id: 'session-A', status: 'open', incrementalPatch: async () => undefined };
			const preparedSession = new BehaviorSubject<typeof sessionA | null>(sessionA);
			mockOpenSession.next(sessionA);
			mockSessions.findOne.mockImplementation((query: string | { selector: { id?: string } }) =>
				typeof query === 'string' || query.selector.id
					? {
							$: preparedSession.pipe(
								map((session) => (session?.status === 'open' ? session : null))
							),
						}
					: { exec: async () => mockOpenSession.value, $: mockOpenSession }
			);
			const order = makeOrder(undefined, [
				{ key: '_wcpos_sale_counter', value: '7' },
				{ key: '_wcpos_session', value: 'session-A' },
			]);
			const view = renderPreparation({ order });
			await act(async () => {});
			expect(view.result.current.prepared).toBe('ready');
			jest.mocked(persistSaleProvenance).mockClear();
			mockLocalPatch.mockClear();
			mockPushDocument.mockClear();
			await act(async () => {
				mockOpenSession.next(null);
				preparedSession.next(status === 'missing' ? null : { ...sessionA, status });
				preparedSession.next(status === 'missing' ? null : { ...sessionA, status });
			});
			expect(view.result.current.paymentURL).toBeUndefined();
			expect(view.result.current.prepared).toBe('failed');
			expect(preparedSession.observed).toBe(false);
			expect(persistSaleProvenance).not.toHaveBeenCalled();
			expect(mockLocalPatch).not.toHaveBeenCalled();
			expect(mockPushDocument).not.toHaveBeenCalled();
			expect(logger.info).toHaveBeenCalledTimes(1);
			expect(logger.info).toHaveBeenCalledWith(
				'pos_checkout.open_register_first',
				expect.objectContaining({ showToast: true })
			);
			const sessionB = { ...sessionA, id: 'session-B' };
			await act(async () => {
				preparedSession.next(sessionB);
				mockOpenSession.next(sessionB);
			});
			expect(commitGatewaySale).toHaveBeenCalledTimes(2);
			expect(persistSaleProvenance).toHaveBeenCalledTimes(1);
			expect(mockSessions.findOne).toHaveBeenCalledWith({
				selector: { id: 'session-B', status: 'open', sync_status: { $ne: 'failed' } },
			});
			expect(view.result.current.paymentURL).toContain('/order-pay/42');
			expect(mockLocalPatch.mock.calls[0][0].data.meta_data).toContainEqual({
				key: '_wcpos_session',
				value: 'session-B',
			});
			await act(async () => mockOpenSession.next({ ...sessionB }));
			expect(commitGatewaySale).toHaveBeenCalledTimes(2);
			view.unmount();
			expect(preparedSession.observed).toBe(false);
		}
	);
	it('opening a session recovers the legacy frame exactly once without a retryToken', async () => {
		const { result } = renderPreparation({
			order: makeOrder(undefined, [
				{ key: '_wcpos_sale_counter', value: '7' },
				{ key: '_wcpos_session', value: 'session-A' },
			]),
		});
		await act(async () => {});
		expect(result.current.prepared).toBe('failed');
		expect(logger.info).toHaveBeenCalledWith(
			'pos_checkout.open_register_first',
			expect.objectContaining({ showToast: true })
		);
		expect(webViewMounts).toBe(0);
		expect(commitGatewaySale).toHaveBeenCalledTimes(1);
		const session = { id: 'session-B', status: 'open', incrementalPatch: async () => undefined };
		mockSessions.findOne.mockReturnValue({ exec: async () => session, $: mockOpenSession });
		await act(async () => mockOpenSession.next(session));
		expect(commitGatewaySale).toHaveBeenCalledTimes(2);
		expect(webViewMounts).toBe(1);
		expect(result.current.paymentURL).toContain('/order-pay/42');
		expect(mockLocalPatch.mock.calls[0][0].data.meta_data).toContainEqual({
			key: '_wcpos_session',
			value: 'session-B',
		});
		await act(async () => mockOpenSession.next({ ...session }));
		expect(commitGatewaySale).toHaveBeenCalledTimes(2);
	});
	it.each(['choose-register', 'provenance-push'])(
		'opening a session does not retry %s failure',
		async (failure) => {
			if (failure === 'choose-register') mockBindingStatus = 'choose';
			else {
				mockSessions.findOne.mockReturnValue({
					exec: async () => ({ id: 'session-A', incrementalPatch: async () => undefined }),
					$: mockOpenSession,
				});
				mockPushDocument.mockRejectedValueOnce(new Error('push failed'));
			}
			const view = renderPreparation({ order: makeOrder() });
			await act(async () => {});
			expect(view.result.current.prepared).toBe('failed');
			await act(async () => mockOpenSession.next({ id: 'session-B' }));
			expect(commitGatewaySale).toHaveBeenCalledTimes(1);
			expect(webViewMounts).toBe(0);
			view.unmount();
			mockBindingStatus = 'bound';
		}
	);
	it.each(['offline', 'online-website-unavailable'])(
		'%s at mount without an open session: toasts, stalls and never exposes the frame',
		async (status) => {
			mockOnlineStatus = status;
			const { result } = renderPreparation({ order: makeOrder() });
			expect(webViewMounts).toBe(0);
			await act(async () => {});
			expect(logger.info).toHaveBeenCalledWith(
				'pos_checkout.open_register_first',
				expect.objectContaining({ showToast: true })
			);
			expect(result.current.prepared).toBe('failed');
			expect(result.current.paymentURL).toBeUndefined();
			expect(webViewMounts).toBe(0);
			expect(persistSaleProvenance).not.toHaveBeenCalled();
			expect(mockLocalPatch).not.toHaveBeenCalled();
			expect(mockPushDocument).not.toHaveBeenCalled();
		}
	);
	it('website unavailable with an open session: waits for preparation, pushes the session stamp only online', async () => {
		mockOnlineStatus = 'online-website-unavailable';
		mockSessions.findOne.mockReturnValue({
			exec: async () => ({ id: 'session-42', incrementalPatch: async () => undefined }),
			$: new BehaviorSubject({ id: 'session-42', status: 'open' }),
		});
		let finish!: () => void;
		const pendingPreparation = new Promise<void>((resolve) => {
			finish = resolve;
		});
		jest.mocked(recordCompletionAttempt).mockReturnValueOnce(pendingPreparation);
		const props = { order: makeOrder() };
		const view = renderPreparation(props);
		await act(async () => {});
		expect(webViewMounts).toBe(0);
		expect(mockPushDocument).not.toHaveBeenCalled();
		await act(async () => finish());
		expect(webViewMounts).toBe(1);
		expect(view.result.current.paymentURL).toContain('/order-pay/42');
		expect(persistSaleProvenance).toHaveBeenCalledWith(expect.anything(), {
			order: props.order,
			source: 'gateway-snapshot',
			sessionId: 'session-42',
			online: false,
		});
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPushDocument).not.toHaveBeenCalled();
		// Offline preparation does not push provenance; reconnection stamps the session.
		mockOnlineStatus = 'online-website-available';
		view.rerender(props);
		await act(async () => {});
		expect(mockLocalPatch.mock.calls[0][0].data.meta_data).toContainEqual({
			key: '_wcpos_session',
			value: 'session-42',
		});
		expect(mockPushDocument).toHaveBeenCalledTimes(1);
	});
	it('offline with sessions off: exposes the frame immediately without preparation or a toast', async () => {
		mockSessionsOn = false;
		mockOnlineStatus = 'offline';
		const { result } = renderPreparation({ order: makeOrder() });
		expect(webViewMounts).toBe(1);
		expect(result.current.paymentURL).toContain('/order-pay/42');
		await act(async () => {});
		expect(recordCompletionAttempt).not.toHaveBeenCalled();
		expect(mockSessions.findOne).not.toHaveBeenCalled();
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPushDocument).not.toHaveBeenCalled();
		expect(logger.info).not.toHaveBeenCalled();
	});
	it('no open session: toasts, stalls and keeps failed preparation closed even offline', async () => {
		const props = { order: makeOrder() };
		const view = renderPreparation(props);
		await act(async () => {});
		expect(logger.info).toHaveBeenCalledWith(
			'pos_checkout.open_register_first',
			expect.objectContaining({ showToast: true })
		);
		expect(view.result.current.prepared).toBe('failed');
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPushDocument).not.toHaveBeenCalled();
		expect(recordCompletionAttempt).not.toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();
		expect(webViewMounts).toBe(0);
		mockOnlineStatus = 'offline';
		await act(async () => view.rerender(props));
		expect(webViewMounts).toBe(0);
	});
	it.each([true, false])(
		'stamps the open session only with sessions enabled: %s',
		async (enabled) => {
			mockSessionsOn = enabled;
			mockSessions.findOne.mockReturnValue({
				exec: async () => ({ id: 'session-42', incrementalPatch: async () => undefined }),
				$: new BehaviorSubject({ id: 'session-42', status: 'open' }),
			});
			renderPreparation({ order: makeOrder() });
			await waitFor(() => expect(webViewMounts).toBe(1));
			const meta: { key: string; value: unknown }[] =
				mockLocalPatch.mock.calls[0][0].data.meta_data;
			expect(meta.filter(({ key }) => key === '_wcpos_session')).toEqual(
				enabled ? [{ key: '_wcpos_session', value: 'session-42' }] : []
			);
			expect(mockPushDocument).toHaveBeenCalledTimes(1);
			if (!enabled) expect(mockSessions.findOne).not.toHaveBeenCalled();
			expect(logger.info).not.toHaveBeenCalledWith(
				'pos_checkout.open_register_first',
				expect.anything()
			);
		}
	);
});
