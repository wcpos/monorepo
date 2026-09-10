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
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import {
	getTerminalPaymentsService,
	type TerminalLegState,
} from '../../../../../services/terminal-payments';
import { useTerminalLeg } from '../payments/server/use-terminal-leg';
import { useResumeTerminalLegs } from '../payments/server/use-resume-terminal-legs';
import { useStoreSession } from '../../../../../contexts/app-state';
import { useTheme } from '../../../../../contexts/theme';
import {
	leaveCheckout,
	type OrderSaveState,
	setTenderMethod,
	useTenderMethod,
} from '../checkout-mode';
import { useOrderSaveState } from '../use-order-save-state';
import { useT } from '../../../../../contexts/translations';
import { usePaymentMethods } from '../../../hooks/use-payment-methods';
import { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useStorageMoneyPathGuard } from '../../../hooks/use-storage-health';
import { useCompleteOrderFlow } from '../hooks/use-complete-order-flow';
import { useRecordManualPayment, useVoidPayments } from '../payments';
import { getDriver } from '../../../../../services/payment-drivers/registry';
import { driverReady, useDriverChanges, useDriverStatus } from './use-driver-status';
import { useRememberedReader } from './remembered-readers';
import { disabledReasonKey, providerErrorMessage } from './labels';
import {
	appliedMinor,
	changeMinor,
	initTenderState,
	quickTenderedAmounts,
	splitPlanLegs,
	type TenderAction,
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
	splitLegs: ReturnType<typeof splitPlanLegs>;

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
	const storedMethodId = useTenderMethod(order.uuid);
	const saveState = useOrderSaveState(order.uuid);
	const [busy, setBusy] = React.useState(false);
	// State drives rendering; the ref closes the same-tick gap that could otherwise record twice.
	const busyRef = React.useRef(false);
	const payload = useRecordField(order, (record) => record.payload);
	const { store, wpCredentials } = useStoreSession();
	useResumeTerminalLegs(order);
	const terminalLeg = useTerminalLeg(order.uuid);
	const service = getTerminalPaymentsService();
	const intentRow = React.useRef<string | null>(null);
	const dp = store.price_num_decimals ?? 2;
	const { methods, byId, loaded: methodsLoaded, unsupportedSchema } = usePaymentMethods();
	const online = useOnlineStatus().status === 'online-website-available';
	const { blockIfDegraded } = useStorageMoneyPathGuard();
	const { localPatch } = useLocalMutation();
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
	const [initialState] = React.useState(() =>
		initTenderState({ methodId: storedMethodId, balanceMinor })
	);
	const [state, reducerDispatch] = React.useReducer(tenderReducer, initialState);
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
	const deviceStatus = useDriverStatus(driver);
	const deviceReaderId = deviceStatus.reader?.id ?? null;
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
	const plannedLegMinor = state.splitPlan
		? state.splitPlan.taken >= state.splitPlan.ways - 1
			? balanceMinor
			: Math.min(state.splitPlan.shareMinor, balanceMinor)
		: balanceMinor;
	const legCapMinor = method?.capabilities.change ? plannedLegMinor : balanceMinor;
	const entryAppliedMinor = appliedMinor(state.entryMinor, legCapMinor);
	const entryChangeMinor = changeMinor(
		state.entryMinor,
		entryAppliedMinor,
		method?.capabilities.change ?? false
	);
	const thisPaymentMinor = state.view === 'amount' ? entryAppliedMinor : plannedLegMinor;
	const afterThisPaymentMinor = balanceMinor - thisPaymentMinor;

	const quickAmountsMinor = React.useMemo(
		() =>
			method?.capabilities.change
				? quickTenderedAmounts(
						thisPaymentMinor,
						QUICK_TENDER_STEPS.map((step) => step * 10 ** dp)
					)
				: [],
		[thisPaymentMinor, dp, method]
	);

	const dispatch = React.useCallback<React.Dispatch<TenderAction>>(
		(action) => {
			if (busyRef.current) return;
			reducerDispatch(action);
			// These are the actions that close the keypad; the store mirrors which method holds it.
			if (action.type === 'back' || action.type === 'reset') setTenderMethod(order.uuid, null);
		},
		[order.uuid, reducerDispatch]
	);

	// A local preference can arrive after the tile tap; leave a cashier's choice alone.
	React.useEffect(() => {
		if (method?.capture.mode !== 'server' || state.readerId !== null || remembered === null) return;
		const readerId = initialReaderId(readers, lockToDefault, remembered);
		if (readerId !== null) dispatch({ type: 'pick-reader', readerId });
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
			const prefillMinor = state.customAmount ? 0 : plannedLegMinor;
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
			state.customAmount,
			tiles,
			service,
			reducerDispatch,
			getLoaded,
		]
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
		try {
			if (balanceMinor === 0) {
				if (blockIfDegraded('process-payment', { orderId: order.uuid })) return;
				const result = await localPatch({ document: order, data: { status: 'completed' } });
				if (!result) throw new Error('zero_balance_completion_failed');
				await completeOrderFlow({ refresh: false });
				return;
			}
			if (!method) return;
			if (entryAppliedMinor <= 0) {
				logger.info(t('pos_checkout.enter_an_amount'), { showToast: true });
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
					}
				);
				return;
			}

			if (method.capture.mode === 'device') {
				if (!deviceTransport || !driverReady(method, deviceTransport)) return;
				if (!service) throw new Error('terminal_service_unavailable');
				const offline = !online || queuedOffline || !payload.id;
				const minted = mintDevicePayment({
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
				intentRow.current = minted.row.id;
				service.begin({
					orderUuid: order.uuid,
					orderId: payload.id ?? 0,
					orderNumber: payload.number ?? '',
					row: minted.row,
					reader: deviceReaderId,
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
				setTenderMethod(order.uuid, null);
				return;
			}
			if (method.capture.mode === 'server') {
				if (!payload.id) {
					logger.info(t('pos_checkout.order_not_on_store_yet'), { showToast: true });
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
						{ showToast: true }
					);
					return;
				}
				if (!service) throw new Error('terminal_service_unavailable');
				const minted = mintServerPayment({
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
				intentRow.current = minted.row.id;
				service.begin({
					orderUuid: order.uuid,
					orderId: payload.id,
					orderNumber: payload.number ?? String(payload.id),
					row: minted.row,
					reader: reader.id,
				});
				void remember(reader.id);
				reducerDispatch({ type: 'tender-started' });
				setTenderMethod(order.uuid, null);
				return;
			}

			const tendered = method.capabilities.change ? fromMinor(state.entryMinor, dp) : null;
			const outcome = await recordManualPayment(order, method, {
				amount: fromMinor(entryAppliedMinor, dp),
				tendered,
			});
			if (outcome.kind === 'recorded') {
				reducerDispatch({ type: 'tender-recorded' });
				setTenderMethod(order.uuid, null);
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
			logger.error(t('pos_checkout.payment_not_recorded'), {
				code: ERROR_CODES.PAYMENT_UNEXPECTED,
				showToast: true,
			});
		} catch (error) {
			logger.error(t('pos_checkout.payment_not_recorded'), {
				code: ERROR_CODES.PAYMENT_UNEXPECTED,
				showToast: true,
				context: { error: error instanceof Error ? error.message : String(error) },
			});
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	}, [
		balanceMinor,
		deviceTransport,
		deviceReaderId,
		online,
		queuedOffline,
		blockIfDegraded,
		completeOrderFlow,
		dp,
		entryAppliedMinor,
		method,
		localPatch,
		order,
		recordManualPayment,
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
			if (intentRow.current === leg.row.id && !['idle', 'creating'].includes(leg.phase)) {
				intentRow.current = null;
				if (leg.outcome === 'failed' && leg.error)
					logger.error(providerErrorMessage(leg.error) ?? t('pos_checkout.payment_not_recorded'), {
						code: ERROR_CODES.PAYMENT_UNEXPECTED,
						showToast: true,
					});
			}
			if (leg.outcome !== 'captured') return;
			service?.dismiss(order.uuid);
			reducerDispatch({ type: 'tender-recorded' });
			if (toMinor(leg.order?.balance ?? derived.balance, dp) === 0) {
				void completeOrderFlow({ refresh: !leg.row.recorded_offline }).catch(() =>
					logger.error(t('pos_checkout.payment_not_recorded'), {
						code: ERROR_CODES.PAYMENT_UNEXPECTED,
						showToast: true,
					})
				);
			}
		};
		const unsubscribe = service?.subscribe(consumeOutcome);
		consumeOutcome();
		return unsubscribe;
	}, [terminalLeg?.outcome, service, order.uuid, derived.balance, dp, completeOrderFlow, t]);

	const pickReader = React.useCallback(
		(id: string) => {
			if (
				selectableReaders(method, service?.readersInUse(), order.uuid).readers.some(
					(reader) => reader.id === id && reader.inUseBy === null
				)
			)
				dispatch({ type: 'pick-reader', readerId: id });
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
				logger.info(t('pos_checkout.device_void_needs_settlement'), { showToast: true });
				return;
			}
			const outcome = await voidPayments(order);
			if (outcome.failed.length > 0) {
				logger.error(t('pos_checkout.void_failed'), {
					code: ERROR_CODES.PAYMENT_UNEXPECTED,
					showToast: true,
				});
				return;
			}
			reducerDispatch({ type: 'reset' });
			setTenderMethod(order.uuid, null);
			leaveCheckout(order.uuid);
			if (screenSize === 'sm') router.replace({ pathname: '/cart' });
		} catch (error) {
			logger.error(t('pos_checkout.void_failed'), {
				code: ERROR_CODES.PAYMENT_UNEXPECTED,
				showToast: true,
				context: { error: error instanceof Error ? error.message : String(error) },
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
			splitLegs: state.splitPlan
				? splitPlanLegs(
						state.splitPlan,
						state.splitPlan.taken
							? liveRows
									.filter((row) => row.status === 'captured')
									.slice(-state.splitPlan.taken)
									.map((row) => toMinor(row.amount, dp))
							: [],
						balanceMinor
					)
				: [],
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
