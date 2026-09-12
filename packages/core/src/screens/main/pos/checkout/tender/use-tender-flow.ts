import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';
import { useRouter } from 'expo-router';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import {
	derive,
	fromMinor,
	mintDevicePayment,
	mintServerPayment,
	type PaymentMethodDescriptor,
	type PaymentRow,
	type PaymentTransport,
	readLedger,
	toMinor,
} from '@wcpos/order-math';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useRegisterSessionCollection } from '../../../../../services/register-session/use-register-session-collections';
import {
	RegisterSessionRequiredError,
	requireOpenSession,
} from '../../../../../services/register-session/session-store';
import {
	getTerminalPaymentsService,
	type TerminalLegState,
} from '../../../../../services/terminal-payments';
import { readBoundRegister } from '../../../../../services/register/register-document';
import { persistProvenance } from '../provenance/persist-provenance';
import { completionMeta } from '../provenance/stamp-completion';
import { useTerminalLeg } from '../payments/server/use-terminal-leg';
import { useResumeTerminalLegs } from '../payments/server/use-resume-terminal-legs';
import { useStoreSession } from '../../../../../contexts/app-state';
import { useTheme } from '../../../../../contexts/theme';
import {
	getCheckoutModeSnapshot,
	leaveCheckout,
	type OrderSaveState,
	setLinesPaidBy,
	setTenderMethod,
	setTenderPlan,
	useTenderMethod,
} from '../checkout-mode';
import { usePushDocument } from '../../../contexts/use-push-document';
import { useOrderSaveState } from '../use-order-save-state';
import { useT } from '../../../../../contexts/translations';
import { usePaymentMethods } from '../../../hooks/use-payment-methods';
import { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useStorageMoneyPathGuard } from '../../../hooks/use-storage-health';
import { useCompleteOrderFlow } from '../hooks/use-complete-order-flow';
import { getUuidFromLineItem } from '../../hooks/utils';
import {
	RecordManualPaymentMirrorError,
	useRecordManualPayment,
	useVoidPayments,
} from '../payments';
import { getDriver } from '../../../../../services/payment-drivers/registry';
import { driverReady, useDriverChanges, useDriverStatus } from './use-driver-status';
import { useRememberedReader } from './remembered-readers';
import { disabledReasonKey, providerErrorMessage } from './labels';
import {
	activePlan,
	appliedMinor,
	changeMinor,
	initTenderState,
	planLegs,
	quickTenderedAmounts,
	type TenderAction,
	type TenderLineId,
	tenderReducer,
	type TenderState,
} from './tender-state';
import {
	buildTenderTiles,
	deviceTransports,
	initialReaderId,
	legacyPaymentMethods,
	selectableReaders,
	type TenderTile,
} from './tiles';

const logger = getLogger(['wcpos', 'pos', 'checkout', 'tender']);

/** The notes a cashier is handed: the balance itself, then the next whole 5, 10 and 50. */
const QUICK_TENDER_STEPS = [5, 10, 50] as const;

export interface TenderFlow {
	rememberedReaderId: string | null;
	rememberReader: (readerId: string) => Promise<void>;
	bootstrapReader: (transport: PaymentTransport) => Promise<Record<string, unknown> | null>;
	deviceTransport?: PaymentTransport | null;
	pickTransport?: (transport: PaymentTransport) => void;
	deviceReady?: boolean;
	terminalLeg: TerminalLegState | null;
	hasLiveTerminalLeg: boolean;
	readers: ReturnType<typeof selectableReaders>['readers'];
	lockToDefault: boolean;
	pickReader: (id: string) => void;
	cancelTerminalLeg: () => void;
	releaseTerminalLeg: () => void;
	retryTerminalCapture: () => void;
	dismissTerminalLeg: () => void;
	retryTerminalLeg: () => void;
	state: TenderState;
	dispatch: React.Dispatch<TenderAction>;

	/** Store decimal places; every `*Minor` number below is in these units. */
	dp: number;
	totalMinor: number;
	paidMinor: number;
	balanceMinor: number;
	thisPaymentMinor: number;
	afterThisPaymentMinor: number;
	plan: TenderState['plan'];
	planLegs: ReturnType<typeof planLegs>['legs'];
	planLabel: string | null;
	planMore: boolean;
	lines: { id: TenderLineId; name: string; quantity: number; totalMinor: number }[];
	linesPaidBy: TenderState['linesPaidBy'];

	/** The order's ledger rows, in ledger order. */
	rows: PaymentRow[];
	/** Rows with status pending | authorized | captured — money that is currently held. */
	liveRows: PaymentRow[];
	hasLiveLeg: boolean;
	online: boolean;

	tiles: TenderTile[];
	legacyMethods: PaymentMethodDescriptor[];
	methodsLoaded: boolean;
	unsupportedSchema: boolean;

	/** The descriptor for `state.methodId`, or null in the select view. */
	method: PaymentMethodDescriptor | null;
	/** What the current entry would apply to the order: min(entry, balance). */
	entryAppliedMinor: number;
	/** What the current entry would hand back, zero for a method that gives no change. */
	entryChangeMinor: number;
	/** Quick tendered chips for the current method; empty when it gives no change. */
	quickAmountsMinor: number[];

	/** A record or a void is in flight; every action must be inert while true. */
	busy: boolean;
	saveState: OrderSaveState | null;
	pickMethod: (methodId: string) => void;
	takeTender: () => Promise<void>;
	cancelPayment: () => Promise<void>;
}

export function useTenderFlow(order: EngineRecord<'orders'>): TenderFlow {
	useDriverChanges();
	const sessions = useRegisterSessionCollection();
	const storedMethodId = useTenderMethod(order.uuid);
	const saveState = useOrderSaveState(order.uuid);
	const [busy, setBusy] = React.useState(false);
	// State drives rendering; the ref closes the same-tick gap that could otherwise record twice.
	const busyRef = React.useRef(false);
	const payload = useRecordField(order, (record) => record.payload);
	const { store, wpCredentials, userDB, site } = useStoreSession();
	const sessionsOn = !!useDocField(store, (value) => value.register_sessions);
	useResumeTerminalLegs(order);
	const terminalLeg = useTerminalLeg(order.uuid);
	const service = getTerminalPaymentsService();
	const intentRow = React.useRef<string | null>(null);
	const dp = store.price_num_decimals ?? 2;
	const { methods, byId, loaded: methodsLoaded, unsupportedSchema } = usePaymentMethods();
	const online = useOnlineStatus().status === 'online-website-available';
	const { blockIfDegraded } = useStorageMoneyPathGuard();
	const { localPatch } = useLocalMutation();
	const pushDocument = usePushDocument();
	// A save queued offline is an order the server does not have yet (or has stale): even
	// once connectivity is back and before the ack lands, tender must behave as offline —
	// online-only tiles stay disabled and a works-offline tile records its local leg.
	const queuedOffline = saveState?.kind === 'queued-offline';
	const recordManualPayment = useRecordManualPayment({ offline: queuedOffline });
	const voidPayments = useVoidPayments();
	const completeOrderFlow = useCompleteOrderFlow(order);
	const router = useRouter();
	const { screenSize } = useTheme();
	const t = useT();

	const rows = React.useMemo(() => readLedger(payload.meta_data), [payload.meta_data]);
	const derived = React.useMemo(
		() => derive(payload.total, rows, methods, { dp }),
		[payload.total, rows, methods, dp]
	);
	const totalMinor = toMinor(payload.total, dp);
	const paidMinor = toMinor(derived.paid, dp);
	const balanceMinor = toMinor(derived.balance, dp);
	// Initialised from the checkout store rather than always from scratch: the store carries
	// the method the URL seeded or the cashier picked before switching tabs, so the keypad
	// comes back the way it was left. The reducer stays the truth for the entry itself, and
	// every action that opens or closes the keypad publishes the method back to the store.
	const [initialState] = React.useState(() => {
		const initialTiles = buildTenderTiles(methods, {
			online: online && !queuedOffline,
			readersInUse: service?.readersInUse(),
			currentOrderUuid: order.uuid,
		});
		const first = initialTiles.find((tile) => !tile.disabled)?.method;
		const stored = initialTiles.find((tile) => tile.method.id === storedMethodId)?.method;
		const methodId = stored?.id ?? first?.id ?? null;
		const initial = initTenderState({ methodId, balanceMinor });
		const storedPlan = getCheckoutModeSnapshot().tenderPlans.get(order.uuid) ?? null;
		const planRows = rows
			.slice(storedPlan?.from ?? rows.length)
			.filter(
				(row) => row.status === 'captured' || (row.status === 'authorized' && row.recorded_offline)
			)
			.map((row) => ({
				minor: toMinor(row.amount, dp),
				title: byId.get(row.method_id)?.title ?? row.method_id,
			}));
		const plan = activePlan(storedPlan, planRows.length, balanceMinor);
		const { readers, lockToDefault } = selectableReaders(
			byId.get(methodId ?? '') ?? null,
			service?.readersInUse(),
			order.uuid
		);
		return {
			...initial,
			plan,
			entryMinor: plan
				? planLegs(plan, planRows, balanceMinor).thisPaymentMinor
				: initial.entryMinor,
			linesPaidBy: getCheckoutModeSnapshot().linesPaidBy.get(order.uuid) ?? {},
			readerId: initialReaderId(readers, lockToDefault, null),
		};
	});
	const [state, reducerDispatch] = React.useReducer(tenderReducer, initialState);
	const manuallyPickedReaderMethod = React.useRef<string | null>(null);
	const { readerId: remembered, getLoaded, remember } = useRememberedReader(state.methodId);
	const liveRows = React.useMemo(
		() => rows.filter(({ status }) => ['pending', 'authorized', 'captured'].includes(status)),
		[rows]
	);
	// useTerminalLeg subscribes to the whole service snapshot, including other readers' holders.
	const readersInUse = service?.readersInUse();
	const tiles = buildTenderTiles(methods, {
		online: online && !queuedOffline,
		readersInUse,
		currentOrderUuid: order.uuid,
		transports:
			state.methodId && state.transport ? { [state.methodId]: state.transport } : undefined,
	});
	const legacyMethods = React.useMemo(() => legacyPaymentMethods(methods), [methods]);
	// A method the store or a URL names but the till does not offer (not POS-enabled, webview
	// mode) must not open a keypad: `takeTender` can only refuse tiles it can see.
	const method =
		state.methodId && tiles.some(({ method: tile }) => tile.id === state.methodId)
			? (byId.get(state.methodId) ?? null)
			: null;
	const bootstrapReader = React.useCallback(
		async (transport: PaymentTransport) => {
			const currentService = getTerminalPaymentsService();
			if (!currentService || !method) throw new Error('Device payment service or method missing');
			return currentService.bootstrap(method.id, { transport });
		},
		[method]
	);
	const driver = method?.capture.mode === 'device' ? getDriver(method.capture.provider) : undefined;
	useDriverStatus(driver);
	const deviceTransport = method
		? (state.transport ?? deviceTransports(method)[0]?.transport ?? null)
		: null;
	const deviceReady = driverReady(method, deviceTransport);
	const pickTransport = React.useCallback(
		(transport: PaymentTransport) => reducerDispatch({ type: 'pick-transport', transport }),
		[reducerDispatch]
	);
	const { readers, lockToDefault } = selectableReaders(method, readersInUse, order.uuid);
	// With a plan, a cash leg is the planned share: notes handed over above it are change,
	// not a bigger leg (the "50" chip for a 46,48 leg). A method that gives no change takes
	// what was typed, capped at the balance — typing a different amount IS changing the leg.
	// The last leg is whatever balance remains (rounding, or a short earlier leg), never the share.
	const rowsSinceFrom = rows
		.slice(state.plan?.from ?? rows.length)
		.filter(
			(row) => row.status === 'captured' || (row.status === 'authorized' && row.recorded_offline)
		)
		.map((row) => ({
			minor: toMinor(row.amount, dp),
			title: byId.get(row.method_id)?.title ?? row.method_id,
		}));
	const plan = activePlan(state.plan, rowsSinceFrom.length, balanceMinor);
	const figures = plan ? planLegs(plan, rowsSinceFrom, balanceMinor) : null;
	const lines = (payload.line_items ?? []).flatMap((line) => {
		const id = getUuidFromLineItem(line) ?? line.id;
		return id === undefined
			? []
			: [
					{
						id,
						name: line.name ?? '',
						quantity: line.quantity ?? 1,
						totalMinor:
							toMinor(line.total ?? '0', dp) +
							(store.tax_display_cart === 'incl' ? toMinor(line.total_tax ?? '0', dp) : 0),
					},
				];
	});
	const itemTitle =
		plan?.kind === 'items'
			? lines
					.filter((line) => plan.lineIds.includes(line.id))
					.map((line) => line.name)
					.join(' + ')
			: null;
	const label = figures?.label;
	const planLabel = !label
		? null
		: label.rest
			? t('pos_checkout.rest_of_the_order')
			: itemTitle
				? label.ways > 1
					? t('pos_checkout.item_payment_n_of', { title: itemTitle, n: label.n, ways: label.ways })
					: itemTitle
				: label.title
					? t('pos_checkout.titled_payment_n_of', {
							title: label.title,
							n: label.n,
							ways: label.ways,
						})
					: t('pos_checkout.payment_n_of', { n: label.n, ways: label.ways });
	const planMore = Boolean(label?.rest && lines.some((line) => !state.linesPaidBy[line.id]));
	const plannedLegMinor = figures?.thisPaymentMinor ?? balanceMinor;
	const legCapMinor = method?.capabilities.change ? plannedLegMinor : balanceMinor;
	const entryAppliedMinor = appliedMinor(state.entryMinor, legCapMinor);
	const entryChangeMinor = changeMinor(
		state.entryMinor,
		entryAppliedMinor,
		method?.capabilities.change ?? false
	);
	const thisPaymentMinor = plannedLegMinor;
	const afterThisPaymentMinor =
		balanceMinor - (state.view === 'amount' ? entryAppliedMinor : thisPaymentMinor);

	const quickAmountsMinor = React.useMemo(
		() =>
			method?.capabilities.change
				? quickTenderedAmounts(
						state.view === 'amount' ? entryAppliedMinor : thisPaymentMinor,
						QUICK_TENDER_STEPS.map((step) => step * 10 ** dp)
					)
				: [],
		[thisPaymentMinor, dp, method, state.view, entryAppliedMinor]
	);

	const dispatch = React.useCallback<React.Dispatch<TenderAction>>(
		(action) => {
			if (busyRef.current) return;
			reducerDispatch(action);
			if (action.type === 'set-plan') setTenderPlan(order.uuid, action.plan);
			if (action.type === 'clear-plan' || action.type === 'arm-custom' || action.type === 'reset')
				setTenderPlan(order.uuid, null);
			// These are the actions that close the keypad; the store mirrors which method holds it.
			if (action.type === 'back' || action.type === 'reset') setTenderMethod(order.uuid, null);
		},
		[order.uuid, reducerDispatch]
	);

	// A local preference can arrive after the tile tap; leave a cashier's choice alone.
	React.useEffect(() => {
		if (
			method?.capture.mode !== 'server' ||
			manuallyPickedReaderMethod.current === method.id ||
			remembered === null
		)
			return;
		const readerId = initialReaderId(readers, lockToDefault, remembered);
		if (readerId !== null && readerId !== state.readerId)
			dispatch({ type: 'pick-reader', readerId });
	}, [method, state.readerId, readers, lockToDefault, remembered, dispatch]);

	const pickMethod = React.useCallback(
		(methodId: string) => {
			if (busyRef.current || (saveState && saveState.kind !== 'queued-offline')) return;
			const tile = tiles.find(({ method: candidate }) => candidate.id === methodId);
			if (!tile) return;
			const offlineTransport =
				tile.method.capture.mode === 'device' && tile.reason === 'offline'
					? deviceTransports(tile.method).find((item) => item.offline === 'queue')
					: undefined;
			if (tile.disabled && !offlineTransport) return;
			const prefillMinor = state.view === 'amount' ? state.entryMinor : plannedLegMinor;
			const { readers, lockToDefault } = selectableReaders(
				tile.method,
				service?.readersInUse(),
				order.uuid
			);
			reducerDispatch({
				type: 'pick-method',
				transport: offlineTransport?.transport,
				methodId,
				prefillMinor,
				readerId: initialReaderId(readers, lockToDefault, getLoaded(methodId)),
			});
			setTenderMethod(order.uuid, methodId);
		},
		[
			plannedLegMinor,
			order.uuid,
			saveState,
			state.view,
			state.entryMinor,
			tiles,
			service,
			reducerDispatch,
			getLoaded,
		]
	);

	// Every row this flow writes names the order it is about. Without it the Logs
	// screen cannot answer "what happened on order 1041?", which is the only question
	// a merchant actually asks of a checkout row.
	const orderContext = React.useMemo(
		() => ({ orderId: payload.id ?? null, orderUUID: order.uuid }),
		[payload.id, order.uuid]
	);

	const tenderRecorded = React.useCallback(
		(row: PaymentRow) => {
			const latest = readLedger(order.getLatest().payload.meta_data);
			const index = latest.findIndex((candidate) => candidate.id === row.id);
			if (index < 0) latest.push(row);
			else latest[index] = row;
			const counts = (candidate: PaymentRow) =>
				candidate.status === 'captured' ||
				(candidate.status === 'authorized' && candidate.recorded_offline);
			const paidAfter = latest.filter(counts).reduce((sum, r) => sum + toMinor(r.amount, dp), 0);
			const action: TenderAction = {
				type: 'tender-recorded',
				balanceMinor: Math.max(0, totalMinor - paidAfter),
				rowsSinceFrom: latest
					.slice(state.plan?.from ?? latest.length)
					.filter(
						(candidate) =>
							candidate.status === 'captured' ||
							(candidate.status === 'authorized' && candidate.recorded_offline)
					)
					.map((candidate) => ({
						amountMinor: toMinor(candidate.amount, dp),
						title: byId.get(candidate.method_id)?.title ?? candidate.method_id,
					})),
			};
			const next = tenderReducer(state, action);
			reducerDispatch(action);
			setTenderPlan(
				order.uuid,
				activePlan(state.plan, action.rowsSinceFrom.length, action.balanceMinor)
			);
			if (state.plan?.kind === 'items') setLinesPaidBy(order.uuid, next.linesPaidBy);
		},
		[order, state, dp, byId, totalMinor]
	);

	const takeTender = React.useCallback(async () => {
		if (
			busyRef.current ||
			(saveState && saveState.kind !== 'queued-offline') ||
			service?.get(order.uuid)
		)
			return;
		busyRef.current = true;
		setBusy(true);
		let savingProvenance = false;
		let sessionId: string | null = null;
		const saveProvenance = async () => {
			if (!online || queuedOffline || !payload.id || entryAppliedMinor !== balanceMinor) return;
			savingProvenance = true;
			await persistProvenance({
				order,
				localPatch,
				pushDocument,
				userDB,
				siteUuid: site.uuid!,
				sessionId,
			});
			savingProvenance = false;
		};
		try {
			const registerId = (await readBoundRegister(userDB, site.uuid!, store.id))?.id ?? null;
			sessionId = await requireOpenSession(sessions, registerId, sessionsOn);
			if (balanceMinor === 0) {
				if (blockIfDegraded('process-payment', { orderId: order.uuid })) return;
				const result = await localPatch({
					document: order,
					data: {
						status: 'completed',
						meta_data: await completionMeta(order.getLatest().payload, {
							userDB,
							siteUuid: site.uuid!,
							storeId: store.id,
							sessionId,
						}),
					},
				});
				if (!result) throw new Error('zero_balance_completion_failed');
				await completeOrderFlow({ refresh: false });
				return;
			}
			if (!method) return;
			if (entryAppliedMinor <= 0) {
				logger.info(t('pos_checkout.enter_an_amount'), { showToast: true, context: orderContext });
				return;
			}
			if (blockIfDegraded('process-payment', { orderId: order.uuid })) return;
			// The tile can go disabled under a keypad that is already open — connectivity
			// drops on an online-only method. Refusing here is right, but a press that does
			// nothing is not: the contract §13 rule is disabled WITH THE REASON, never a
			// dead button, so the cashier gets the same line the tile is showing.
			const selectedTile = tiles.find(({ method: candidate }) => candidate.id === method.id);
			if (selectedTile?.disabled && selectedTile.reason) {
				logger.info(
					t(disabledReasonKey(selectedTile.reason), {
						title: method.title,
						...(typeof selectedTile.reason === 'object' ? selectedTile.reason : {}),
					}),
					{
						showToast: true,
						context: { ...orderContext, method: method.id },
					}
				);
				return;
			}

			if (method.capture.mode === 'device') {
				const liveDriver = getDriver(method.capture.provider);
				const status = liveDriver?.status$.get();
				if (
					!deviceTransport ||
					!liveDriver?.availability().available ||
					status?.connection !== 'connected' ||
					status.reader?.transport !== deviceTransport
				) {
					logger.info(
						t(
							status?.connection === 'connecting'
								? 'pos_checkout.reader_connecting'
								: 'pos_checkout.reader_disconnected'
						),
						{ showToast: true, context: { ...orderContext, method: method.id } }
					);
					return;
				}
				if (!service) throw new Error('terminal_service_unavailable');
				const offline = !online || queuedOffline || !payload.id;
				const minted = mintDevicePayment({
					registerId,
					sessionId,
					method,
					transport: deviceTransport,
					recordedOffline: offline,
					orderId: payload.id ?? null,
					amount: fromMinor(entryAppliedMinor, dp),
					currency: store.currency ?? '',
					cashierId: wpCredentials.id ?? 0,
					storeId: store.id || null,
					dp,
					now: () => new Date().toISOString(),
					uuid: uuidv4,
				});
				if (!minted.ok) throw new Error(minted.reason);
				await saveProvenance();
				intentRow.current = minted.row.id;
				service.begin({
					dp,
					orderUuid: order.uuid,
					orderId: payload.id ?? 0,
					orderNumber: payload.number ?? '',
					row: minted.row,
					reader: status.reader.id,
					method,
					transport: deviceTransport,
					offline,
					tipEligibleMinor:
						method.capabilities.tips === 'on_reader' &&
						deviceTransports(method).find((item) => item.transport === deviceTransport)?.tips ===
							'on_reader'
							? entryAppliedMinor
							: null,
				});
				reducerDispatch({ type: 'tender-started' });
				return;
			}
			if (method.capture.mode === 'server') {
				if (!payload.id) {
					logger.info(t('pos_checkout.order_not_on_store_yet'), {
						showToast: true,
						context: orderContext,
					});
					return;
				}
				const reader = selectableReaders(method, service?.readersInUse(), order.uuid).readers.find(
					(reader) => reader.id === state.readerId
				);
				if (!reader || reader.inUseBy !== null) {
					logger.info(
						reader?.inUseBy
							? t('pos_checkout.reader_in_use', { number: reader.inUseBy })
							: t('pos_checkout.choose_a_terminal'),
						{ showToast: true, context: { ...orderContext, method: method.id } }
					);
					return;
				}
				if (!service) throw new Error('terminal_service_unavailable');
				const minted = mintServerPayment({
					registerId,
					sessionId,
					method,
					orderId: payload.id,
					amount: fromMinor(entryAppliedMinor, dp),
					currency: store.currency ?? '',
					cashierId: wpCredentials.id ?? 0,
					storeId: store.id || null,
					dp,
					now: () => new Date().toISOString(),
					uuid: uuidv4,
				});
				if (!minted.ok) throw new Error(minted.reason);
				await saveProvenance();
				intentRow.current = minted.row.id;
				service.begin({
					dp,
					orderUuid: order.uuid,
					orderId: payload.id,
					orderNumber: payload.number ?? String(payload.id),
					row: minted.row,
					reader: reader.id,
				});
				void remember(reader.id);
				reducerDispatch({ type: 'tender-started' });
				return;
			}

			const tendered = method.capabilities.change ? fromMinor(state.entryMinor, dp) : null;
			const outcome = await recordManualPayment(order, method, {
				amount: fromMinor(entryAppliedMinor, dp),
				tendered,
			});
			if (outcome.kind === 'recorded') {
				tenderRecorded(outcome.row);
				if (balanceMinor - entryAppliedMinor === 0) {
					await completeOrderFlow({ refresh: outcome.via === 'online' });
				}
				return;
			}
			if (outcome.kind === 'refused') {
				reducerDispatch({ type: 'back' });
				setTenderMethod(order.uuid, null);
				return;
			}
			if (outcome.kind === 'failed') {
				reducerDispatch({ type: 'back' });
				setTenderMethod(order.uuid, null);
				return;
			}
			logger.error(t('pos_checkout.payment_not_recorded'), {
				code: ERROR_CODES.PAYMENT_UNEXPECTED,
				showToast: true,
				context: { ...orderContext, method: method.id },
			});
		} catch (error) {
			if (error instanceof RegisterSessionRequiredError) throw error;
			if (error instanceof RecordManualPaymentMirrorError) {
				const { outcome } = error;
				// A refusal that could not be mirrored is NOT money the store holds: the
				// server stored a `failed` row and took nothing. `raiseAttention` has already
				// told the cashier what to do about it, and telling them the store has the
				// payment would both contradict that and stop them retrying a corrected one.
				if (outcome.kind === 'refused') {
					reducerDispatch({ type: 'back' });
					setTenderMethod(order.uuid, null);
					return;
				}
				// The store answered 2xx: the money is on the order there, and only this
				// till's copy failed to save. Reporting "payment not recorded" here reads as
				// "take it again", which is how one mirror failure becomes two payments.
				logger.warn(t('pos_checkout.payment_recorded_not_synced'), {
					code: ERROR_CODES.PAYMENT_RECORDED_NOT_MIRRORED,
					showToast: true,
					terminal: { operationId: outcome.row.id },
					context: {
						...orderContext,
						paymentId: outcome.row.id,
						amount: outcome.row.amount,
						method: outcome.row.method_id,
						status: outcome.row.status,
						error: error.cause instanceof Error ? error.cause.message : String(error.cause),
					},
				});
				// Fold the accepted row into the pane's own view of the ledger. Without this
				// the keypad goes back to the pre-payment balance and cheerfully offers the
				// whole amount again — the recovery refresh may not have landed, and the
				// resident order is exactly the copy that failed to save.
				tenderRecorded(outcome.row);
				// The store's summary is the only balance worth trusting now. Complete only
				// when it says the order is settled; otherwise stay on the pane, which is now
				// showing what is actually left to pay.
				if (outcome.order && toMinor(outcome.order.balance, dp) === 0) {
					await completeOrderFlow({ refresh: true });
				}
				return;
			}
			if (savingProvenance) {
				logger.error('Checkout failed', {
					code: ERROR_CODES.CHECKOUT_FAILED_CART_SAFE,
					showToast: true,
					toast: { title: t('pos_cart.checkout_failed') },
					context: {
						...orderContext,
						method: method?.id ?? null,
						error: error instanceof Error ? error.message : String(error),
					},
				});
				return;
			}
			logger.error(t('pos_checkout.payment_not_recorded'), {
				code: ERROR_CODES.PAYMENT_UNEXPECTED,
				showToast: true,
				context: {
					...orderContext,
					method: method?.id ?? null,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	}, [
		sessions,
		sessionsOn,
		balanceMinor,
		deviceTransport,
		online,
		queuedOffline,
		blockIfDegraded,
		completeOrderFlow,
		dp,
		entryAppliedMinor,
		method,
		userDB,
		site.uuid,
		pushDocument,
		localPatch,
		order,
		recordManualPayment,
		tenderRecorded,
		remember,
		saveState,
		state.entryMinor,
		state.readerId,
		payload.id,
		payload.number,
		service,
		store,
		wpCredentials,
		t,
		tiles,
		reducerDispatch,
	]);

	// Subscribe before receipt routing can unmount checkout; also consume a final leg on remount.
	React.useEffect(() => {
		const consumeOutcome = () => {
			const leg = service?.get(order.uuid);
			if (!leg) return;
			// The take that is still in the cashier's hands, as opposed to an outcome that
			// lands while they are watching the terminal timeline.
			const ownTake = intentRow.current === leg.row.id;
			if (ownTake && !['idle', 'creating'].includes(leg.phase)) {
				intentRow.current = null;
			}
			// A decline, an expiry or a failed capture usually settles well after polling
			// starts, by which point `intentRow` is already null — so gating the LOG on it
			// kept every settled failure out of the ledger. Nor can it require `leg.error`:
			// the ordinary asynchronous decline arrives as a 200 whose payment row reads
			// `failed`, with no error object at all. The row is always written, once per
			// payment row; only the toast stays with the initial take, because the timeline
			// already shows a failure the cashier is looking at.
			if (leg.outcome === 'failed' && service?.claimFailureNarration(leg.row.id)) {
				logger.error(
					providerErrorMessage(leg.error) ??
						leg.row.failure_reason ??
						t('pos_checkout.payment_not_recorded'),
					{
						// A declined or cancelled card is an ordinary outcome with an ordinary
						// answer — ask for another card. Reporting it as "payment handling hit an
						// unexpected problem" sends the cashier looking for a fault that is not there.
						code: ERROR_CODES.PAYMENT_TERMINAL_REFUSED,
						showToast: ownTake,
						terminal: { operationId: leg.row.id },
						context: {
							orderId: leg.row.order_id || null,
							orderUUID: order.uuid,
							paymentId: leg.row.id,
							amount: leg.row.amount,
							method: leg.row.method_id,
							status: leg.row.status,
							errorCode: leg.error?.code ?? null,
							reason: leg.row.failure_reason ?? null,
						},
					}
				);
			}
			if (leg.outcome !== 'captured') return;
			service?.dismiss(order.uuid);
			tenderRecorded(leg.row);
			if (toMinor(leg.order?.balance ?? derived.balance, dp) === 0) {
				void completeOrderFlow({ refresh: !leg.row.recorded_offline }).catch((error) =>
					// The card has been charged by this point: the failure is finishing the
					// order, not taking the money, and saying "payment not recorded" here is
					// how a captured payment gets taken twice.
					logger.error(t('pos_checkout.paid_but_order_not_finished'), {
						// Its own code, not PAYMENT101: with a code and no explicit toast title
						// the toast shows the CODE's summary and hint, and PAYMENT101's hint is
						// "No action needed" — the opposite of what this cashier must do.
						code: ERROR_CODES.PAYMENT_CAPTURED_ORDER_UNFINISHED,
						showToast: true,
						terminal: { operationId: leg.row.id },
						context: {
							orderId: leg.row.order_id || null,
							orderUUID: order.uuid,
							paymentId: leg.row.id,
							amount: leg.row.amount,
							method: leg.row.method_id,
							error: error instanceof Error ? error.message : String(error),
						},
					})
				);
			}
		};
		const unsubscribe = service?.subscribe(consumeOutcome);
		consumeOutcome();
		return unsubscribe;
	}, [
		terminalLeg?.outcome,
		service,
		order.uuid,
		derived.balance,
		dp,
		completeOrderFlow,
		t,
		tenderRecorded,
	]);

	const pickReader = React.useCallback(
		(id: string) => {
			if (
				selectableReaders(method, service?.readersInUse(), order.uuid).readers.some(
					(reader) => reader.id === id && reader.inUseBy === null
				)
			) {
				manuallyPickedReaderMethod.current = method?.id ?? null;
				dispatch({ type: 'pick-reader', readerId: id });
			}
		},
		[method, service, order.uuid, dispatch]
	);
	const cancelTerminalLeg = React.useCallback(() => {
		void service?.leg(order.uuid)?.cancel('cashier');
	}, [service, order.uuid]);
	const releaseTerminalLeg = React.useCallback(() => {
		void service?.leg(order.uuid)?.release();
	}, [service, order.uuid]);
	const retryTerminalCapture = React.useCallback(() => {
		void service?.leg(order.uuid)?.capture();
	}, [service, order.uuid]);
	const dismissTerminalLeg = React.useCallback(() => {
		service?.dismiss(order.uuid);
		dispatch({ type: 'set-tab', tab: 'payments' });
		dispatch({ type: 'back' });
	}, [service, order.uuid, dispatch]);
	const retryTerminalLeg = React.useCallback(() => {
		const leg = service?.get(order.uuid);
		if (!leg || leg.phase !== 'final') return;
		service?.dismiss(order.uuid);
		dispatch({ type: 'set-tab', tab: 'payments' });
		dispatch({
			type: 'pick-method',
			methodId: leg.row.method_id,
			prefillMinor: toMinor(leg.row.amount, dp),
			readerId: leg.row.provider_refs?.reader ?? leg.reader,
		});
		setTenderMethod(order.uuid, leg.row.method_id);
	}, [service, order.uuid, dp, dispatch]);

	const cancelPayment = React.useCallback(async () => {
		if (busyRef.current || (service?.get(order.uuid) && service.get(order.uuid)?.phase !== 'final'))
			return;
		busyRef.current = true;
		setBusy(true);
		try {
			if (
				rows.some(
					(row) =>
						row.capture_mode === 'device' &&
						((row.recorded_offline && row.status === 'authorized') ||
							(!online && ['pending', 'authorized', 'captured'].includes(row.status)))
				)
			) {
				logger.info(t('pos_checkout.device_void_needs_settlement'), {
					showToast: true,
					context: orderContext,
				});
				return;
			}
			const outcome = await voidPayments(order);
			if (outcome.failed.length > 0) {
				// Each of these is money still held on the customer's card. The row has to
				// name them, or the merchant cannot tell which payment to refund by hand.
				//
				// Only a refusal the store actually answered earns the definitive "refund
				// these" instruction. A void whose answer was lost may already have been
				// applied, and refunding it by hand would return the money twice.
				const everyoneRefused = outcome.failed.every((failure) => failure.refused);
				logger.error(t('pos_checkout.void_failed'), {
					code: everyoneRefused
						? ERROR_CODES.PAYMENT_VOID_REFUSED
						: ERROR_CODES.PAYMENT_OUTCOME_UNKNOWN,
					showToast: true,
					context: {
						...orderContext,
						paymentId: outcome.failed.map((failure) => failure.paymentId).join(', '),
						reason: outcome.failed
							.map((failure) => `${failure.paymentId}: ${failure.message}`)
							.join('; '),
						voided: outcome.rows.length,
					},
				});
				return;
			}
			reducerDispatch({ type: 'reset' });
			setTenderMethod(order.uuid, null);
			leaveCheckout(order.uuid);
			if (screenSize === 'sm') router.replace({ pathname: '/cart' });
		} catch (error) {
			logger.error(t('pos_checkout.void_failed'), {
				code: ERROR_CODES.PAYMENT_VOID_REFUSED,
				showToast: true,
				context: {
					...orderContext,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	}, [order, router, screenSize, t, voidPayments, service, reducerDispatch, rows, online]);

	return React.useMemo(
		() => ({
			rememberedReaderId: remembered,
			rememberReader: remember,
			terminalLeg,
			bootstrapReader,
			deviceTransport,
			pickTransport,
			deviceReady,
			readers,
			lockToDefault,
			pickReader,
			cancelTerminalLeg,
			releaseTerminalLeg,
			retryTerminalCapture,
			dismissTerminalLeg,
			retryTerminalLeg,
			state,
			dispatch,
			dp,
			totalMinor,
			paidMinor,
			balanceMinor,
			thisPaymentMinor,
			afterThisPaymentMinor,
			plan,
			planLegs: figures?.legs ?? [],
			planLabel,
			planMore,
			lines,
			linesPaidBy: state.linesPaidBy,
			rows,
			liveRows,
			hasLiveTerminalLeg: Boolean(terminalLeg && terminalLeg.phase !== 'final'),
			hasLiveLeg: liveRows.length > 0,
			online,
			tiles,
			legacyMethods,
			methodsLoaded,
			unsupportedSchema,
			method,
			entryAppliedMinor,
			entryChangeMinor,
			quickAmountsMinor,
			busy,
			saveState,
			pickMethod,
			takeTender,
			cancelPayment,
		}),
		[
			plan,
			figures,
			planLabel,
			planMore,
			lines,
			remembered,
			remember,
			terminalLeg,
			bootstrapReader,
			deviceTransport,
			pickTransport,
			deviceReady,
			readers,
			lockToDefault,
			pickReader,
			cancelTerminalLeg,
			releaseTerminalLeg,
			retryTerminalCapture,
			dismissTerminalLeg,
			retryTerminalLeg,
			state,
			dispatch,
			dp,
			totalMinor,
			paidMinor,
			balanceMinor,
			thisPaymentMinor,
			afterThisPaymentMinor,
			rows,
			liveRows,
			online,
			tiles,
			legacyMethods,
			methodsLoaded,
			unsupportedSchema,
			method,
			entryAppliedMinor,
			entryChangeMinor,
			quickAmountsMinor,
			busy,
			saveState,
			pickMethod,
			takeTender,
			cancelPayment,
		]
	);
}
