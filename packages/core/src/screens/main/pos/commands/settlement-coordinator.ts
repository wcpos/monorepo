import { combineLatest, type Observable, Subscription } from 'rxjs';

import {
	activeAwaitingCustomer,
	type CouponContext,
	hasLiveSettlementLeg,
	readLedger,
	serverOwnsMoney,
	toMinor,
} from '@wcpos/order-math';
import { OPEN_ORDER_STATUSES } from '@wcpos/query';

import { netPaidForBoundary } from './paid-balance-boundary';
import { type CouponReferences, replayContentKey } from './coupon-continuation';
import { isActionRefusal } from '../../../../extensions/actions';
import { enqueueOrderMutation, type OrderMutationContext } from '../hooks/order-mutation-queue';
import { readQuickDiscountIntent } from '../hooks/quick-discount';

import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { CartConfigInputs, OrderPayload } from './cart-config-for-order';

export type RatesReady = { ready: boolean; generation: number };
export type SettlementDiagnostic = { type: string; uuid: string; at: number; error?: unknown };
interface Deps {
	inputs$: Observable<CartConfigInputs>;
	completionChanges$?: Observable<unknown>;
	// null is a rebind: discard old records AND queued work before accepting the new scope.
	openOrders$: Observable<CurrentOrderRecord[] | null>;
	ratesReady$: Observable<RatesReady>;
	references$: Observable<CouponReferences>;
	readCoupons: (payload: OrderPayload) => Promise<CouponContext>;
	serverOwnsMoney: (uuid: string) => boolean;
	storeContract?: () => string | null;
	orderSaveState: (uuid: string) => { kind: string } | null;
	inCheckout: (uuid: string) => boolean;
	settle: (
		uuid: string,
		record: CurrentOrderRecord,
		allowed: (payload: OrderPayload, ignoreCheckout?: boolean) => boolean,
		coupons: CouponContext | undefined,
		queue: OrderMutationContext
	) => Promise<unknown>;
	now: () => number;
	observe: (event: SettlementDiagnostic) => void;
}

function closed(
	payload: OrderPayload,
	record: CurrentOrderRecord,
	deps: Deps,
	dp: number,
	ignoreCheckout = false
) {
	const netPaid = netPaidForBoundary(payload, dp);
	return Boolean(
		!OPEN_ORDER_STATUSES.some((status) => status === payload.status) ||
		(record as { isNew?: boolean }).isNew ||
		hasLiveSettlementLeg(payload.meta_data) ||
		activeAwaitingCustomer(payload.meta_data) ||
		(payload.status !== 'pos-partial' &&
			netPaid > 0 &&
			toMinor(payload.total, dp) <= toMinor(netPaid, dp)) ||
		['rejected', 'conflicted', 'needs-revision'].includes(
			deps.orderSaveState(record.uuid)?.kind ?? ''
		) ||
		(!ignoreCheckout && deps.inCheckout(record.uuid)) ||
		deps.serverOwnsMoney(record.uuid) ||
		serverOwnsMoney(payload.meta_data, { storeContract: deps.storeContract?.() })
	);
}

const needsReferences = (record: { payload: OrderPayload }) =>
	record.payload.coupon_lines?.some((line) => line.code != null && !readQuickDiscountIntent(line));

const hasCoupons = (record: { payload: OrderPayload }) =>
	record.payload.coupon_lines?.some((line) => line.code != null);

/** One sequential drain; content and payment coverage (not aggregates/revisions) invalidate a pass. */
export function createSettlementCoordinator(deps: Deps): { stop(): void } {
	let records: CurrentOrderRecord[] = [];
	let inputs: CartConfigInputs;
	let rates: RatesReady = { ready: false, generation: 0 };
	let epoch = 0;
	let completionGeneration = 0;
	let inputGeneration = 0;
	let stopped = false;
	let running = false;
	let dirty = false;
	const seen = new Map<string, string>();
	const flights = new Map<string, symbol>();
	let references: CouponReferences = { ready: false, generation: '' };
	let referenceSubscription: Subscription | undefined;
	const releaseReferences = () => {
		referenceSubscription?.unsubscribe();
		referenceSubscription = undefined;
		references = { ready: false, generation: '' };
	};
	const fingerprint = (record: CurrentOrderRecord, ignoreCheckout = false) => {
		const p = record.payload;
		return JSON.stringify([
			needsReferences(record)
				? replayContentKey(record)
				: [p.line_items, p.fee_lines, p.shipping_lines, p.coupon_lines, p.status],
			needsReferences(record) ? references : null,
			p.billing,
			p.shipping,
			p.meta_data?.filter(
				({ key }) =>
					key === '_woocommerce_pos_tax_based_on' ||
					key === '_wcpos_money_owner' ||
					key === '_wcpos_money_owner_hint'
			),
			// A guard can outlive a ledger update that supersedes a paid-balance completion.
			readLedger(p.meta_data)
				.filter(({ status }) => status === 'authorized' || status === 'captured')
				.map(({ id, status, amount, refunded_amount }) => [id, status, amount, refunded_amount]),
			closed(p, record, deps, inputs.settings.priceNumDecimals, ignoreCheckout),
			inputs,
			rates.generation,
			completionGeneration,
		]);
	};
	const settle = async (...args: Parameters<Deps['settle']>) => {
		const generation = inputGeneration;
		const outcome = await deps.settle(...args);
		const reason = isActionRefusal(outcome)
			? outcome.deny.reasonKey
			: outcome &&
				  typeof outcome === 'object' &&
				  'superseded' in outcome &&
				  outcome.superseded === true &&
				  'reason' in outcome
				? outcome.reason
				: undefined;
		// Do not lose catalog or checkout-exit emissions consumed while a pass awaited its guards.
		if (
			typeof reason === 'string' &&
			[
				'pos_cart.only_n_available',
				'pos_products.out_of_stock',
				'catalog_changed',
				'in_checkout',
			].includes(reason)
		) {
			seen.delete(args[0]);
			// Retry only for new inputs; persistent shortages must not spin.
			if (generation !== inputGeneration) {
				dirty = true;
				void drain();
			}
		}
	};
	async function replay(record: CurrentOrderRecord, key: string, pass: number) {
		const uuid = record.uuid;
		const content = replayContentKey(record);
		seen.set(uuid, key);
		const flight = Symbol();
		flights.set(uuid, flight);
		try {
			// Collection reads must not hold a per-order mutation slot.
			const coupons = await deps.readCoupons(record.payload);
			await enqueueOrderMutation(uuid, async (slot) => {
				const fresh = (slot.order ?? record).getLatest();
				const allowed = (payload: OrderPayload, ignoreCheckout = false) =>
					!stopped &&
					pass === epoch &&
					rates.ready &&
					(!needsReferences(fresh) || references.ready) &&
					seen.get(uuid) === key &&
					flights.get(uuid) === flight &&
					records.some((r) => r.uuid === uuid) &&
					fingerprint(fresh, ignoreCheckout) === key &&
					replayContentKey({ uuid, payload }) === content &&
					!closed(payload, fresh, deps, inputs.settings.priceNumDecimals, ignoreCheckout);
				if (allowed(fresh.payload)) await settle(uuid, fresh, allowed, coupons, slot);
			});
		} catch (error) {
			if (flights.get(uuid) === flight) seen.delete(uuid);
			deps.observe({ type: 'settlement.failed', uuid, at: deps.now(), error });
		}
	}
	async function drain() {
		if (running || stopped) return;
		running = true;
		try {
			while (dirty && !stopped) {
				dirty = false;
				const pass = epoch;
				for (const record of [...records].sort((a, b) => a.uuid.localeCompare(b.uuid))) {
					if (stopped || pass !== epoch || !rates.ready) break;
					const uuid = record.uuid;
					if (hasCoupons(record.getLatest())) {
						const fresh = record.getLatest();
						const key = fingerprint(fresh);
						if (closed(fresh.payload, fresh, deps, inputs.settings.priceNumDecimals)) {
							// Preserve the in-flight fence when checkout is the only new exclusion.
							if (
								flights.has(uuid) &&
								!closed(fresh.payload, fresh, deps, inputs.settings.priceNumDecimals, true)
							)
								continue;
							seen.delete(uuid);
							flights.delete(uuid);
							continue;
						}
						if ((!needsReferences(fresh) || references.ready) && seen.get(uuid) !== key)
							void replay(fresh, key, pass);
						continue;
					}
					if (seen.get(uuid) === fingerprint(record.getLatest())) continue;
					try {
						await enqueueOrderMutation(uuid, async (slot) => {
							const fresh = (slot.order ?? record).getLatest();
							const current = () =>
								!stopped && pass === epoch && rates.ready && records.some((r) => r.uuid === uuid);
							if (!current()) return;
							seen.set(uuid, fingerprint(fresh));
							const allowed = (payload: OrderPayload, ignoreCheckout = false) =>
								current() &&
								!hasCoupons({ payload }) &&
								!closed(payload, fresh, deps, inputs.settings.priceNumDecimals, ignoreCheckout);
							if (allowed(fresh.payload)) await settle(uuid, fresh, allowed, undefined, slot);
						});
					} catch (error) {
						seen.delete(uuid);
						deps.observe({ type: 'settlement.failed', uuid, at: deps.now(), error });
					}
				}
			}
		} finally {
			running = false;
		}
	}
	const subscription = combineLatest([deps.inputs$, deps.openOrders$, deps.ratesReady$]).subscribe(
		([nextInputs, nextRecords, nextRates]) => {
			inputGeneration++;
			inputs = nextInputs;
			rates = nextRates;
			if (!rates.ready) seen.clear();
			if (nextRecords === null) {
				epoch++;
				releaseReferences();
				seen.clear();
				flights.clear();
			}
			records = nextRecords ?? [];
			if (!records.some(needsReferences)) releaseReferences();
			else if (!referenceSubscription) {
				referenceSubscription = new Subscription();
				referenceSubscription.add(
					deps.references$.subscribe({
						next: (value) => {
							references = value;
							dirty = true;
							void drain();
						},
						error: (error) =>
							deps.observe({ type: 'settlement.failed', uuid: '', at: deps.now(), error }),
					})
				);
			}
			for (const uuid of seen.keys())
				if (!records.some((r) => r.uuid === uuid)) {
					seen.delete(uuid);
					flights.delete(uuid);
				}
			dirty = true;
			void drain();
		}
	);
	subscription.add(
		deps.completionChanges$?.subscribe(() => {
			completionGeneration++;
			dirty = true;
			void drain();
		})
	);
	return {
		stop() {
			stopped = true;
			epoch++;
			subscription.unsubscribe();
			releaseReferences();
			seen.clear();
			flights.clear();
			records = [];
		},
	};
}
