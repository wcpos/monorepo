import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { BehaviorSubject, Subject } from 'rxjs';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import type { EngineWarning } from '@wcpos/order-math';
import {
	observeCatalogChanges,
	observeCoverage,
	readCoverageGeneration,
	useDocField,
	useQueryRuntime,
} from '@wcpos/query';
import { observeOpenSessionPresence } from '@wcpos/query/register-session';
import { getLogger } from '@wcpos/utils/logger';
import type { EngineRecord } from '@wcpos/query';
import { useCoverageGeneration } from '@wcpos/query/query-state';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { couponReferences } from './coupon-continuation';
import { useRepairTaxExempt } from './use-tax-exempt';
import { readCouponContext } from '../hooks/use-coupon-context';
import { writeOrderChanges } from './write-order-changes';
import { commitAtBoundary } from './boundary-commit';
import { useCloseSale } from './close-sale';
import { orderLocked } from './paid-balance-boundary';
import { type SettleError, settlePayload } from './settle-payload';
import { useSaleContext } from '../checkout/hooks/use-sale-context';
import { completeSale } from '../checkout/sale-completion';
import {
	createSettlementCoordinator,
	type RatesReady,
	type SettlementDiagnostic,
} from './settlement-coordinator';
import { useT } from '../../../../contexts/translations';
import { useStoreSession } from '../../../../contexts/app-state';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import {
	getCheckoutModeSnapshot,
	getOrderSaveState,
	subscribeCheckoutMode,
} from '../checkout/checkout-mode';
import { useOpenOrdersHandle } from '../contexts/current-order/use-open-orders-handle';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';
import { useServerOwnsMoneyReader } from '../contexts/order-money-divergence';
import { useCartConfigInputs, useCartConfigReader } from '../hooks/use-cart-config';
import { useTaxSettings } from '../../contexts/tax-rates';

import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { OrderPayload } from './cart-config-for-order';

const logger = getLogger(['wcpos', 'pos', 'settlement']);
const observe = (event: SettlementDiagnostic) => logger.warn(event.type, { context: event });
const inCheckout = (uuid: string) => getCheckoutModeSnapshot().checkoutOrders.has(uuid);
// Per engine, not per mount: compaction drops the lane and a remount never sees `complete` again.
const ratesLanded = new WeakMap<RxdbSyncEngine, number>();

/** Session-owned, beside the config reader; no cart tab owns this subscription. */
export function SettlementCoordinatorProvider() {
	const manager = useQueryRuntime();
	const { wpCredentials, store } = useStoreSession();
	const cashier = useDocField(wpCredentials, (value) => value.id) as number | undefined;
	const storeId = useDocField(store, (value) => value.id) as number | undefined;
	const { registerId, status: bindingStatus } = useRegisterBinding();
	const bindingRef = React.useRef({ status: bindingStatus, registerId });
	React.useLayoutEffect(() => {
		bindingRef.current = { status: bindingStatus, registerId };
	}, [bindingStatus, registerId]);
	const saleContext = useSaleContext();
	const closeSale = useCloseSale();
	const handle = useOpenOrdersHandle(cashier, storeId, registerId);
	const inputs = useCartConfigInputs();
	// Coverage says the lane synced once; only a database read says `allRates` is an answer (#3186).
	const { ratesRead } = useTaxSettings();
	const read = useCartConfigReader();
	const serverOwnsMoney = useServerOwnsMoneyReader();
	const report = useReportEngineWarnings();
	const t = useT();
	// One system context for the coordinator's boundary commits and the tax-exempt repair's.
	const systemContext = React.useCallback(
		(): Parameters<typeof commitAtBoundary>[0] => ({
			...saleContext,
			source: 'system',
			configForOrder: read,
			serverOwnsMoney,
			bindingStatus: bindingStatus === 'unknown' ? 'none' : bindingStatus,
			readBindingStatus: () =>
				bindingRef.current.status === 'unknown' ? 'none' : bindingRef.current.status,
			readRegisterId: () => bindingRef.current.registerId,
			complete: (order, outcome, slot) =>
				completeSale(saleContext, order, outcome, { host: 'background' }, slot),
			closeSale,
		}),
		[saleContext, read, serverOwnsMoney, bindingStatus, closeSale]
	);
	const repair = useRepairTaxExempt(
		React.useCallback<Parameters<typeof useRepairTaxExempt>[0]>(
			(order, queue, coupons, valid) =>
				commitAtBoundary(systemContext(), {
					order: order as EngineRecord<'orders'>,
					queue,
					write: (changes) => writeOrderChanges(manager, { document: order, changes }),
					coupons: coupons && {
						...coupons.context,
						taxStatusFor: coupons.taxStatusFor ?? coupons.context.taxStatusFor,
					},
					allowed: (payload, ignoreCheckout) =>
						valid() &&
						!orderLocked(
							payload,
							order,
							{ serverOwnsMoney, orderSaveState: getOrderSaveState, inCheckout },
							read(payload).dp,
							{ ignoreCheckout }
						),
				}),
			[systemContext, manager, serverOwnsMoney, read]
		)
	);
	// Held in a ref so a deps identity change never tears the coordinator down.
	const repairRef = React.useRef(repair);
	React.useLayoutEffect(() => {
		repairRef.current = repair;
	}, [repair]);
	const generation = useCoverageGeneration(manager.engine, 'taxRates');
	const coverage$ = React.useMemo(
		() => observeCoverage(manager.engine, { collection: 'taxRates', lane: 'reference' }),
		[manager.engine]
	);
	const coverage = useObservableEagerState(coverage$);
	const [inputs$] = React.useState(() => new BehaviorSubject(inputs));
	// A boundary deferred offline is retried when the till reconnects.
	const [reconnected$] = React.useState(() => new Subject<void>());
	const online = useOnlineStatus().status === 'online-website-available';
	const wasOnline = React.useRef(online);
	React.useEffect(() => {
		if (online && !wasOnline.current) reconnected$.next();
		wasOnline.current = online;
	}, [online, reconnected$]);
	const [ratesReady$] = React.useState(
		() => new BehaviorSubject<RatesReady>({ ready: false, generation: 0 })
	);
	// Publish readiness only with committed config inputs, never ahead of the rates render.
	React.useLayoutEffect(() => {
		inputs$.next(inputs);
		if (coverage.complete) ratesLanded.set(manager.engine, generation);
		ratesReady$.next({
			ready: ratesRead && ratesLanded.get(manager.engine) === generation,
			generation,
		});
	}, [inputs, inputs$, ratesReady$, coverage, generation, manager.engine, ratesRead]);
	React.useEffect(() => {
		const openOrders$ = new BehaviorSubject<CurrentOrderRecord[] | null>(null);
		const coordinator = createSettlementCoordinator({
			inputs$,
			reconnected$,
			completionChanges$: registerId
				? observeOpenSessionPresence(saleContext.storeDB, { registerId })
				: undefined,
			openOrders$,
			ratesReady$,
			references$: couponReferences(manager.engine),
			readCoupons: (payload) =>
				readCouponContext(manager, {
					lineItems: payload.line_items ?? [],
					couponLines: payload.coupon_lines ?? [],
				}),
			serverOwnsMoney,
			orderSaveState: getOrderSaveState,
			inCheckout,
			repairTaxExempt: (record, exempt, valid) => repairRef.current(record, exempt, valid),
			now: Date.now,
			observe,
			settle: async (uuid, document, allowed, coupons, queue) => {
				let warnings: readonly EngineWarning[] = [];
				let boundary = false;
				let failure: SettleError | undefined;
				const write = (changes: Parameters<typeof writeOrderChanges>[1]['changes']) =>
					writeOrderChanges(manager, { document, changes });
				await write((payload) => {
					boundary = false;
					if (!allowed(payload as OrderPayload)) return {};
					const outcome = settlePayload({
						payload: payload as OrderPayload,
						config: read(payload as OrderPayload),
						coupons,
						owner: { uuid, serverOwnsMoney },
					});
					if (outcome.kind === 'owned') return {};
					warnings = outcome.warnings;
					if (outcome.kind === 'error') {
						failure = outcome.error;
						return {};
					}
					boundary = outcome.kind === 'boundary';
					return outcome.kind === 'patch' ? outcome.changes : {};
				});
				let outcome;
				if (boundary)
					outcome = await commitAtBoundary(systemContext(), {
						order: document as EngineRecord<'orders'>,
						queue,
						write,
						coupons,
						allowed,
					});
				report(warnings, { orderId: uuid, site: 'settlement-coordinator' });
				if (failure)
					logger.warn('Cart settlement failed', {
						showToast: true,
						toast: {
							title:
								failure.code === 'missing_coupon'
									? t('pos_cart.coupon_not_found')
									: t('pos_cart.coupon_apply_failed'),
						},
						context: failure,
					});
				return outcome;
			},
		});
		// Both live database rebind causes are announced before db$ (engine scope/reset contract).
		const offEvents = manager.engine.events((event) => {
			if (event.type === 'scope-switched' || event.type === 'collection-reset') {
				openOrders$.next(null);
				ratesReady$.next({ ...ratesReady$.value, ready: false });
			}
		});
		const rates = coverage$.subscribe((value) => {
			if (
				!value.complete &&
				ratesLanded.get(manager.engine) !== readCoverageGeneration(manager.engine, 'taxRates')
			)
				ratesReady$.next({ ...ratesReady$.value, ready: false });
		});
		const orders = handle.observe().subscribe((value) => {
			if (value.ready && !value.error)
				openOrders$.next(value.hits.map(({ record }) => record as CurrentOrderRecord));
		});
		const stock = observeCatalogChanges(manager.engine).subscribe(() =>
			inputs$.next(inputs$.value)
		);
		const offCheckout = subscribeCheckoutMode(() => openOrders$.next(openOrders$.value));
		return () => {
			coordinator.stop();
			offEvents();
			offCheckout();
			stock.unsubscribe();
			rates.unsubscribe();
			orders.unsubscribe();
		};
	}, [
		manager,
		handle,
		read,
		closeSale,
		serverOwnsMoney,
		report,
		t,
		inputs$,
		reconnected$,
		ratesReady$,
		coverage$,
		saleContext,
		systemContext,
		bindingStatus,
		registerId,
	]);
	return null;
}
