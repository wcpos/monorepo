import * as React from 'react';

import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { observeCatalogChanges, useDocField, useQueryRuntime } from '@wcpos/query';
import { observeOpenSessionPresence } from '@wcpos/query/register-session';
import { getLogger } from '@wcpos/utils/logger';

import { couponReferences } from './coupon-continuation';
import { useRepairTaxExempt } from './use-tax-exempt';
import { readCouponContext } from '../hooks/use-coupon-context';
import { useStoreCalculatedCouponTypes } from '../../hooks/use-coupon-types';
import { writeOrderChanges } from './write-order-changes';
import { useRatesReady } from './rates-ready-provider';
import { settleOpenOrder } from './settle-open-order';
import { useBoundaryCommitter } from './use-boundary-committer';
import { useOrderLockReaders } from './use-order-lock-readers';
import { useSaleContext } from '../checkout/hooks/use-sale-context';
import {
	createSettlementCoordinator,
	type RatesReady,
	type SettlementDiagnostic,
} from './settlement-coordinator';
import { useT } from '../../../../contexts/translations';
import { useStoreSession } from '../../../../contexts/app-state';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { subscribeCheckoutMode } from '../checkout/checkout-mode';
import { useOpenOrdersHandle } from '../contexts/current-order/use-open-orders-handle';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';
import { useCartConfigInputs, useCartConfigReader } from '../hooks/use-cart-config';

import type { CurrentOrderRecord } from '../contexts/current-order/context';

const logger = getLogger(['wcpos', 'pos', 'settlement']);
const observe = (event: SettlementDiagnostic) => logger.warn(event.type, { context: event });

/**
 * Session-owned, beside the config reader; no cart tab owns this subscription. It renders nothing:
 * it feeds the coordinator. Only a scope (engine, cashier, store, register) restarts it.
 */
export function SettlementCoordinatorProvider() {
	const manager = useQueryRuntime();
	const { wpCredentials, store } = useStoreSession();
	const cashier = useDocField(wpCredentials, (value) => value.id) as number | undefined;
	const storeId = useDocField(store, (value) => value.id) as number | undefined;
	const { registerId } = useRegisterBinding();
	const { storeDB } = useSaleContext();
	const handle = useOpenOrdersHandle(cashier, storeId, registerId);
	const inputs = useCartConfigInputs();
	const storeCalculatedTypes = useStoreCalculatedCouponTypes();
	// The save-state and checkout readers are module-stable; only the money reader can change.
	const { serverOwnsMoney, orderSaveState, inCheckout } = useOrderLockReaders();
	const configForOrder = useCartConfigReader();
	const commit = useBoundaryCommitter('system');
	const repair = useRepairTaxExempt();
	const report = useReportEngineWarnings();
	const t = useT();
	// Read when the coordinator calls: a reader, binding or translation change never restarts it.
	const latest = React.useEffectEvent(() => ({
		storeCalculatedTypes,
		serverOwnsMoney,
		configForOrder,
		commit,
		repair,
		report,
		t,
	}));
	const { subscribe } = useRatesReady();
	const [inputs$] = React.useState(() => new BehaviorSubject(inputs));
	// A boundary deferred offline is retried when the till reconnects.
	const [reconnected$] = React.useState(() => new Subject<void>());
	const online = useOnlineStatus().status === 'online-website-available';
	const wasOnline = React.useRef(online);
	React.useEffect(() => {
		if (online && !wasOnline.current) reconnected$.next();
		wasOnline.current = online;
	}, [online, reconnected$]);
	// A child's layout effect: the inputs land before the provider publishes readiness.
	React.useLayoutEffect(() => inputs$.next(inputs), [inputs, inputs$]);
	React.useEffect(() => {
		const openOrders$ = new BehaviorSubject<CurrentOrderRecord[] | null>(null);
		const coordinator = createSettlementCoordinator({
			inputs$,
			reconnected$,
			completionChanges$: registerId
				? observeOpenSessionPresence(storeDB, { registerId })
				: undefined,
			openOrders$,
			ratesReady$: new Observable<RatesReady>((s) => subscribe((r) => s.next(r))),
			references$: couponReferences(manager.engine),
			readCoupons: (payload) =>
				readCouponContext(manager, {
					lineItems: payload.line_items ?? [],
					couponLines: payload.coupon_lines ?? [],
					storeCalculatedTypes: latest().storeCalculatedTypes,
				}),
			serverOwnsMoney: (uuid) => latest().serverOwnsMoney(uuid),
			orderSaveState,
			inCheckout,
			repairTaxExempt: (record, exempt, valid) => latest().repair(record, exempt, valid),
			now: Date.now,
			observe,
			settle: (...args) =>
				settleOpenOrder(
					{
						...latest(),
						write: (document, changes) => writeOrderChanges(manager, { document, changes }),
					},
					...args
				),
		});
		// Both live database rebind causes are announced before db$ (engine scope/reset contract).
		const offEvents = manager.engine.events((event) => {
			if (event.type === 'scope-switched' || event.type === 'collection-reset')
				openOrders$.next(null);
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
			orders.unsubscribe();
		};
	}, [
		manager,
		handle,
		storeDB,
		registerId,
		inputs$,
		reconnected$,
		subscribe,
		orderSaveState,
		inCheckout,
	]);
	return null;
}
