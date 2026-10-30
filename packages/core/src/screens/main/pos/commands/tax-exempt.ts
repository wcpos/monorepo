import isEqual from 'lodash/isEqual';
// @ts-expect-error: semver lacks type declarations in this project
import semver from 'semver';

import { isActiveLineItem, retaxCartLines } from '@wcpos/order-math';
import { POS_META_KEYS, wooMetaCarrier } from '@wcpos/sync-core';
import type { CouponContext, EngineWarning, LineItemInput, TaxStatus } from '@wcpos/order-math';

import {
	type ActionActor,
	type ActionContext,
	dispatchAction,
} from '../../../../extensions/actions';
import { quickDiscountCouponInput, readQuickDiscountIntent } from '../hooks/quick-discount';
import { enqueueCartAction } from '../hooks/enqueue-cart-action';
import { orderLocked, type OrderLockReaders } from './paid-balance-boundary';
import { type BoundaryCommit, type Deps, settleCartWrite } from './settle-cart-write';
import { needsReferences } from './settlement-coordinator';

import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { OrderPayload } from './cart-config-for-order';

// Below this the server leaves exempt coupon_lines[].discount_tax non-zero (woocommerce/woocommerce#69441).
const COUPON_EXEMPT_MIN_WC_VERSION = '11.3.0';
const missing = { deny: { reasonKey: 'tax_exempt_references_unavailable' } };
const locked = { deny: { reasonKey: 'tax_exempt_locked' } };
const unsupported = { deny: { reasonKey: 'tax_exempt_wc_version' } };
const couponed = (payload: OrderPayload) => payload.coupon_lines?.some((line) => line.code != null);
export interface TaxExemptDeps extends OrderLockReaders, Deps<unknown> {
	ctx: ActionContext;
	actor: ActionActor;
	commitAtBoundary: BoundaryCommit;
	readCoupons: (payload: OrderPayload) => Promise<CouponContext>;
	references: () => Promise<boolean>;
	/** Key by product/variation id, never object identity: the resolver receives fresh lines. */
	readTaxStatuses: (
		lines: LineItemInput[]
	) => Promise<(line: LineItemInput) => TaxStatus | undefined>;
	wcVersion: () => string;
	reportEngineWarnings: (
		warnings: readonly EngineWarning[],
		info: { orderId: string; site: string }
	) => void;
}
const referenceInputs = (payload: OrderPayload) => [
	new Set(
		(payload.line_items ?? [])
			.filter(isActiveLineItem)
			.map(({ product_id, variation_id }) => JSON.stringify([product_id, variation_id]))
	),
	new Set(payload.coupon_lines?.filter((line) => line.code != null).map((line) => line.code)),
];
export async function setTaxExempt(
	deps: TaxExemptDeps,
	order: CurrentOrderRecord,
	input: { exempt: boolean; source: 'user' | 'repair' }
) {
	const payload = order.getLatest().payload;
	const readInputs = referenceInputs(payload);
	let context: CouponContext | undefined;
	const version = semver.coerce(deps.wcVersion());
	const supported = version && semver.gte(version, COUPON_EXEMPT_MIN_WC_VERSION);
	if (input.exempt && couponed(payload) && !supported) return unsupported;
	if (needsReferences({ payload })) {
		if (!(await deps.references())) return missing;
		context = await deps.readCoupons(payload);
	}
	const definitions = new Map(context?.coupons);
	const coupons = {
		context: {
			...context,
			coupons: definitions,
			productCategories: context?.productCategories ?? new Map(),
		},
		missing,
		boundary: locked,
	};
	// Collection reads precede the queue; the resolver is synchronous on every resident run.
	const taxStatusFor = await deps.readTaxStatuses(
		(payload.line_items ?? []).filter(
			(line) =>
				isActiveLineItem(line) && !line.meta_data?.some(({ key }) => key === POS_META_KEYS.posData)
		)
	);
	return enqueueCartAction(
		order,
		(target, queue) => {
			let warnings: readonly EngineWarning[] = [];
			const data = (currentPayload: OrderPayload) => {
				warnings = [];
				const { dp, pricesIncludeTax } = deps.configForOrder(currentPayload);
				// Temporary orders carry the flag into birth; the durable hint skips settlement, not this write.
				const options = { allowNew: true, allowDurableHint: true };
				if (orderLocked(currentPayload, target, deps, dp, options)) return locked;
				// Inclusive stores are a separate spec (epic §3).
				if (input.exempt && pricesIncludeTax)
					return { deny: { reasonKey: 'tax_exempt_inclusive_store' } };
				if (input.exempt && couponed(currentPayload) && !supported) return unsupported;
				if (
					needsReferences({ payload: currentPayload }) &&
					(!context || !isEqual(readInputs, referenceInputs(currentPayload)))
				)
					return missing;
				for (const line of currentPayload.coupon_lines ?? []) {
					const intent = readQuickDiscountIntent(line);
					if (line.code != null && intent)
						definitions.set(line.code.toLowerCase(), quickDiscountCouponInput(line.code, intent));
				}
				const meta_data = wooMetaCarrier.stampVatExempt(currentPayload.meta_data, input.exempt);
				const config = deps.configForOrder({ ...currentPayload, meta_data });
				const retaxed = retaxCartLines(currentPayload, config, { taxStatusFor });
				const { changed: _changed, warnings: latestWarnings, ...lines } = retaxed;
				warnings = latestWarnings;
				return {
					...lines,
					...(!isEqual(meta_data, currentPayload.meta_data) && { meta_data }),
				};
			};
			return dispatchAction({
				event: 'cart.tax_exempt.set',
				token: queue.dispatchToken,
				ctx: deps.ctx,
				input: {
					orderId: target.uuid,
					actor: deps.actor,
					source: input.source === 'repair' ? 'system' : 'user',
					payload: {
						orderId: target.uuid,
						...input,
						previousExempt: wooMetaCarrier.vatExempt(target.getLatest().payload.meta_data),
					},
				},
				bottom: async () => {
					const result = await settleCartWrite({ document: target, queue, coupons, data }, deps);
					deps.reportEngineWarnings(warnings, { orderId: target.uuid, site: 'setTaxExempt' });
					return result;
				},
			});
		},
		'caller'
	);
}
