import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { BehaviorSubject } from 'rxjs';

import {
	derive,
	type EngineWarning,
	getNetPaymentTotal,
	readLedger,
	settleAggregate,
	settlementPatch,
	snapshotFromOrderJSON,
	toMinor,
} from '@wcpos/order-math';
import { observeCoverage, useDocField, useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { plainPatch } from './plain-patch';
import { settleCartWrite } from './settle-cart-write';
import {
	createSettlementCoordinator,
	type RatesReady,
	type SettlementDiagnostic,
} from './settlement-coordinator';
import { useStoreSession } from '../../../../contexts/app-state';
import { useCoverageGeneration } from '../../../../query/scope-key';
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

import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { OrderPayload } from './cart-config-for-order';

const logger = getLogger(['wcpos', 'pos', 'settlement']);
const observe = (event: SettlementDiagnostic) => logger.warn(event.type, { context: event });

/** Session-owned, beside the config reader; no cart tab owns this subscription. */
export function SettlementCoordinatorProvider() {
	const manager = useQueryRuntime();
	const { wpCredentials, store } = useStoreSession();
	const cashier = useDocField(wpCredentials, (value) => value.id) as number | undefined;
	const storeId = useDocField(store, (value) => value.id) as number | undefined;
	const { registerId } = useRegisterBinding();
	const handle = useOpenOrdersHandle(cashier, storeId, registerId);
	const inputs = useCartConfigInputs();
	const read = useCartConfigReader();
	const serverOwnsMoney = useServerOwnsMoneyReader();
	const report = useReportEngineWarnings();
	const generation = useCoverageGeneration(manager.engine, 'taxRates');
	const coverage$ = React.useMemo(
		() => observeCoverage(manager.engine, { collection: 'taxRates', lane: 'reference' }),
		[manager.engine]
	);
	const coverage = useObservableEagerState(coverage$);
	const [inputs$] = React.useState(() => new BehaviorSubject(inputs));
	const [ratesReady$] = React.useState(
		() => new BehaviorSubject<RatesReady>({ ready: false, generation: 0 })
	);
	// Publish readiness only with committed config inputs, never ahead of the rates render.
	React.useLayoutEffect(() => {
		inputs$.next(inputs);
		ratesReady$.next({ ready: coverage.complete, generation });
	}, [inputs, inputs$, ratesReady$, coverage, generation]);
	React.useEffect(() => {
		const openOrders$ = new BehaviorSubject<CurrentOrderRecord[] | null>(null);
		const coordinator = createSettlementCoordinator({
			inputs$,
			openOrders$,
			ratesReady$,
			serverOwnsMoney,
			orderSaveState: getOrderSaveState,
			inCheckout: (uuid) => getCheckoutModeSnapshot().checkoutOrders.has(uuid),
			now: Date.now,
			observe,
			settle: async (uuid, document, allowed) => {
				let warnings: readonly EngineWarning[] = [];
				let boundary = false;
				await settleCartWrite(
					{ document, data: {} },
					{
						configForOrder: read,
						serverOwnsMoney,
						localPatch: ({ document: latest, changes }) =>
							plainPatch(manager, 'orders', {
								document: latest,
								changes: (payload) => {
									if (!allowed(payload as OrderPayload)) return {};
									const config = read(payload as OrderPayload);
									const result = settleAggregate(snapshotFromOrderJSON(payload), config);
									warnings = result.warnings;
									const rows = readLedger((payload as OrderPayload).meta_data);
									const paid = derive(payload.total as string, rows, [], { dp: config.dp }).paid;
									const netPaid = getNetPaymentTotal(
										paid,
										rows
											.filter((row) => ['authorized', 'captured'].includes(row.status))
											.map((row) => ({ amount: row.refunded_amount }))
									);
									boundary =
										payload.status === 'pos-partial' &&
										result.changed &&
										toMinor(settlementPatch(result).total, config.dp) <=
											toMinor(netPaid, config.dp);
									return boundary ? {} : changes(payload);
								},
							}),
					}
				);
				report(warnings, { orderId: uuid, site: 'settlement-coordinator' });
				if (boundary) observe({ type: 'settlement.boundary-deferred', uuid, at: Date.now() });
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
			if (!value.complete) ratesReady$.next({ ...ratesReady$.value, ready: false });
		});
		const orders = handle.observe().subscribe((value) => {
			if (value.ready && !value.error)
				openOrders$.next(value.hits.map(({ record }) => record as CurrentOrderRecord));
		});
		const offCheckout = subscribeCheckoutMode(() => openOrders$.next(openOrders$.value));
		return () => {
			coordinator.stop();
			offEvents();
			offCheckout();
			rates.unsubscribe();
			orders.unsubscribe();
		};
	}, [manager, handle, read, serverOwnsMoney, report, inputs$, ratesReady$, coverage$]);
	return null;
}
