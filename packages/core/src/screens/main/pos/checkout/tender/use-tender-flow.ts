import * as React from 'react';

import { useRouter } from 'expo-router';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import {
	derive,
	fromMinor,
	type PaymentMethodDescriptor,
	type PaymentRow,
	readLedger,
	toMinor,
} from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useStoreSession } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { usePaymentMethods } from '../../../hooks/use-payment-methods';
import { useStorageMoneyPathGuard } from '../../../hooks/use-storage-health';
import { useCompleteOrderFlow } from '../hooks/use-complete-order-flow';
import { useRecordManualPayment, useVoidPayments } from '../payments';
import {
	appliedMinor,
	changeMinor,
	initialTenderState,
	quickTenderedAmounts,
	type TenderAction,
	tenderReducer,
	type TenderState,
} from './tender-state';
import { buildTenderTiles, legacyPaymentMethods, type TenderTile } from './tiles';

const logger = getLogger(['wcpos', 'pos', 'checkout', 'tender']);

/** The notes a cashier is handed: the balance itself, then the next whole 5, 10 and 50. */
const QUICK_TENDER_STEPS = [5, 10, 50] as const;

export interface TenderFlow {
	state: TenderState;
	dispatch: React.Dispatch<TenderAction>;

	/** Store decimal places; every `*Minor` number below is in these units. */
	dp: number;
	totalMinor: number;
	paidMinor: number;
	balanceMinor: number;

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
	pickMethod: (methodId: string) => void;
	takeTender: () => Promise<void>;
	cancelPayment: () => Promise<void>;
}

export function useTenderFlow(order: EngineRecord<'orders'>): TenderFlow {
	const [state, reducerDispatch] = React.useReducer(tenderReducer, initialTenderState);
	const [busy, setBusy] = React.useState(false);
	// State drives rendering; the ref closes the same-tick gap that could otherwise record twice.
	const busyRef = React.useRef(false);
	const payload = useRecordField(order, (record) => record.payload);
	const { store } = useStoreSession();
	const dp = store.price_num_decimals ?? 2;
	const { methods, byId, loaded: methodsLoaded, unsupportedSchema } = usePaymentMethods();
	const online = useOnlineStatus().status === 'online-website-available';
	const { blockIfDegraded } = useStorageMoneyPathGuard();
	const recordManualPayment = useRecordManualPayment();
	const voidPayments = useVoidPayments();
	const completeOrderFlow = useCompleteOrderFlow(order);
	const router = useRouter();
	const t = useT();

	const rows = React.useMemo(() => readLedger(payload.meta_data), [payload.meta_data]);
	const derived = React.useMemo(
		() => derive(payload.total, rows, methods, { dp }),
		[payload.total, rows, methods, dp]
	);
	const totalMinor = toMinor(payload.total, dp);
	const paidMinor = toMinor(derived.paid, dp);
	const balanceMinor = toMinor(derived.balance, dp);
	const liveRows = React.useMemo(
		() => rows.filter(({ status }) => ['pending', 'authorized', 'captured'].includes(status)),
		[rows]
	);
	const tiles = React.useMemo(() => buildTenderTiles(methods, { online }), [methods, online]);
	const legacyMethods = React.useMemo(() => legacyPaymentMethods(methods), [methods]);
	const method = state.methodId ? (byId.get(state.methodId) ?? null) : null;
	const entryAppliedMinor = appliedMinor(state.entryMinor, balanceMinor);
	const entryChangeMinor = changeMinor(
		state.entryMinor,
		entryAppliedMinor,
		method?.capabilities.change ?? false
	);
	const quickAmountsMinor = React.useMemo(
		() =>
			method?.capabilities.change
				? quickTenderedAmounts(
						balanceMinor,
						QUICK_TENDER_STEPS.map((step) => step * 10 ** dp)
					)
				: [],
		[balanceMinor, dp, method]
	);

	const dispatch = React.useCallback<React.Dispatch<TenderAction>>((action) => {
		if (!busyRef.current) reducerDispatch(action);
	}, []);

	const pickMethod = React.useCallback(
		(methodId: string) => {
			if (busyRef.current) return;
			const tile = tiles.find(({ method: candidate }) => candidate.id === methodId);
			if (!tile || tile.disabled) return;
			const prefillMinor =
				state.splitShareMinor === null
					? balanceMinor
					: Math.min(state.splitShareMinor, balanceMinor);
			reducerDispatch({ type: 'pick-method', methodId, prefillMinor });
		},
		[balanceMinor, state.splitShareMinor, tiles]
	);

	const takeTender = React.useCallback(async () => {
		if (busyRef.current) return;
		busyRef.current = true;
		setBusy(true);
		try {
			if (!method) return;
			if (entryAppliedMinor <= 0) {
				logger.info(t('pos_checkout.enter_an_amount'), { showToast: true });
				return;
			}
			if (blockIfDegraded('process-payment', { orderId: order.uuid })) return;

			const tendered = method.capabilities.change ? fromMinor(state.entryMinor, dp) : null;
			const outcome = await recordManualPayment(order, method, {
				amount: fromMinor(entryAppliedMinor, dp),
				tendered,
			});
			if (outcome.kind === 'recorded') {
				reducerDispatch({ type: 'tender-recorded' });
				if (balanceMinor - entryAppliedMinor === 0) {
					await completeOrderFlow({ refresh: outcome.via === 'online' });
				}
				return;
			}
			if (outcome.kind === 'refused') {
				reducerDispatch({ type: 'tender-recorded' });
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
		blockIfDegraded,
		completeOrderFlow,
		dp,
		entryAppliedMinor,
		method,
		order,
		recordManualPayment,
		state.entryMinor,
		t,
	]);

	const cancelPayment = React.useCallback(async () => {
		if (busyRef.current) return;
		busyRef.current = true;
		setBusy(true);
		try {
			const outcome = await voidPayments(order);
			if (outcome.failed.length > 0) {
				logger.error(t('pos_checkout.void_failed'), {
					code: ERROR_CODES.PAYMENT_UNEXPECTED,
					showToast: true,
				});
				return;
			}
			reducerDispatch({ type: 'reset' });
			router.replace({ pathname: '/cart' });
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
	}, [order, router, t, voidPayments]);

	return React.useMemo(
		() => ({
			state,
			dispatch,
			dp,
			totalMinor,
			paidMinor,
			balanceMinor,
			rows,
			liveRows,
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
			pickMethod,
			takeTender,
			cancelPayment,
		}),
		[
			state,
			dispatch,
			dp,
			totalMinor,
			paidMinor,
			balanceMinor,
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
			pickMethod,
			takeTender,
			cancelPayment,
		]
	);
}
