import * as React from 'react';

import { useDocField, useQueryRuntime } from '@wcpos/query';

import { setTaxExempt, type TaxExemptDeps } from './tax-exempt';
import { waitForCouponReferences } from './coupon-continuation';
import { useBoundaryCommit } from './use-boundary-commit';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCartConfigReader } from '../hooks/use-cart-config';
import { useServerOwnsMoneyReader } from '../contexts/order-money-divergence';
import { getCheckoutModeSnapshot, getOrderSaveState } from '../checkout/checkout-mode';
import { useActionContext } from '../hooks/use-action-context';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';
import { readCatalogTaxStatuses, readCouponContext } from '../hooks/use-coupon-context';
import { isActionRefusal } from '../../../../extensions/actions';
import { presentActionRefusal } from '../../../../extensions/actions/present';
import { useStoreSession } from '../../../../contexts/app-state';

import type { CurrentOrderRecord } from '../contexts/current-order/context';

export function useWcVersion() {
	const { site } = useStoreSession();
	const wcVersion = useDocField(site, (v) => v.wc_version);
	const ref = React.useRef(wcVersion);
	// Queued commands read the version from the latest committed render.
	React.useLayoutEffect(() => {
		ref.current = wcVersion;
	}, [wcVersion]);
	return React.useCallback(() => ref.current ?? '', []);
}

export function useTaxExemptDeps(): TaxExemptDeps {
	const { localPatch } = useLocalMutation();
	const commitAtBoundary = useBoundaryCommit(localPatch);
	const configForOrder = useCartConfigReader();
	const serverOwnsMoney = useServerOwnsMoneyReader();
	const { ctx, actor } = useActionContext();
	const reportEngineWarnings = useReportEngineWarnings();
	const runtime = useQueryRuntime();
	const wcVersion = useWcVersion();
	return React.useMemo(
		() => ({
			localPatch,
			commitAtBoundary,
			configForOrder,
			serverOwnsMoney,
			ctx,
			actor,
			reportEngineWarnings,
			wcVersion,
			orderSaveState: getOrderSaveState,
			inCheckout: (uuid) => getCheckoutModeSnapshot().checkoutOrders.has(uuid),
			readCoupons: (payload) =>
				readCouponContext(runtime, {
					lineItems: payload.line_items ?? [],
					couponLines: payload.coupon_lines ?? [],
				}),
			references: () => waitForCouponReferences(runtime.engine),
			readTaxStatuses: (lines) => readCatalogTaxStatuses(runtime.engine, lines),
		}),
		[
			localPatch,
			commitAtBoundary,
			configForOrder,
			serverOwnsMoney,
			ctx,
			actor,
			reportEngineWarnings,
			runtime,
			wcVersion,
		]
	);
}

export function useSetTaxExempt() {
	const deps = useTaxExemptDeps();
	return React.useCallback(
		async (order: CurrentOrderRecord, exempt: boolean) => {
			const outcome = await setTaxExempt(deps, order, { exempt, source: 'user' });
			if (isActionRefusal(outcome))
				presentActionRefusal(deps.ctx, outcome, { orderId: order.uuid });
			return outcome;
		},
		[deps]
	);
}

/** A repair runs with nobody at the till: the coordinator's system boundary commit, never the cashier's. */
export function useRepairTaxExempt(
	commitAtBoundary: (
		...args: [...Parameters<TaxExemptDeps['commitAtBoundary']>, valid: () => boolean]
	) => Promise<unknown>
) {
	const deps = useTaxExemptDeps();
	return React.useCallback(
		(record: CurrentOrderRecord, exempt: boolean, valid: () => boolean = () => true) =>
			setTaxExempt(
				{ ...deps, commitAtBoundary: (o, r, q, c) => commitAtBoundary(o, r, q, c, valid) },
				record,
				{ exempt, source: 'repair', valid }
			),
		[deps, commitAtBoundary]
	);
}
