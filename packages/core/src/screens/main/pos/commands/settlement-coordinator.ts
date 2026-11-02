import { combineLatest, type Observable, Subscription } from 'rxjs';

import { isActiveFeeLine, isActiveLineItem, isFixedFeeLine, readLedger } from '@wcpos/order-math';
import type { CouponContext } from '@wcpos/order-math';
import { POS_META_KEYS, wooMetaCarrier } from '@wcpos/sync-core';

import { orderLocked } from './paid-balance-boundary';
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
	/** Emits when the till reconnects: a boundary deferred offline is tried again. */
	reconnected$?: Observable<unknown>;
	// null is a rebind: discard old records AND queued work before accepting the new scope.
	openOrders$: Observable<CurrentOrderRecord[] | null>;
	ratesReady$: Observable<RatesReady>;
	references$: Observable<CouponReferences>;
	readCoupons: (payload: OrderPayload) => Promise<CouponContext>;
	serverOwnsMoney: (uuid: string) => boolean;
	orderSaveState: (uuid: string) => { kind: string } | null;
	inCheckout: (uuid: string) => boolean;
	repairTaxExempt(order: CurrentOrderRecord, flag: boolean, valid: () => boolean): Promise<unknown>;
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

export const needsReferences = (record: { payload: OrderPayload }) =>
	record.payload.coupon_lines?.some((line) => line.code != null && !readQuickDiscountIntent(line));

const hasCoupons = (record: { payload: OrderPayload }) =>
	record.payload.coupon_lines?.some((line) => line.code != null);

export function needsTaxRepair(payload: OrderPayload, lastFlag: boolean | undefined): boolean {
	const flag = wooMetaCarrier.vatExempt(payload.meta_data);
	if (lastFlag !== undefined && lastFlag !== flag) return true;
	if (!flag) return false;
	const lines = [
		...(payload.line_items ?? []).filter(isActiveLineItem),
		...(payload.fee_lines ?? []).filter(
			(line) => isActiveFeeLine(line) && isFixedFeeLine(line, !!payload.prices_include_tax)
		),
	];
	return lines.some(
		(line) =>
			Number(line.total_tax || 0) !== 0 ||
			Number((line as { subtotal_tax?: string }).subtotal_tax || 0) !== 0 ||
			line.taxes?.some((t) => Number(t.total || 0) !== 0 || Number(t.subtotal || 0) !== 0)
	);
}

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
	const lastFlag = new Map<string, boolean>();
	const repaired = new Map<string, string>();
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
					key === POS_META_KEYS.vatExempt ||
					key === '_woocommerce_pos_tax_based_on' ||
					key === '_wcpos_money_owner_hint'
			),
			// A guard can outlive a ledger update that supersedes a paid-balance completion.
			readLedger(p.meta_data)
				.filter(({ status }) => status === 'authorized' || status === 'captured')
				.map(({ id, status, amount, refunded_amount }) => [id, status, amount, refunded_amount]),
			orderLocked(p, record, deps, inputs.settings.priceNumDecimals, { ignoreCheckout }),
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
		// A boundary that could not close offline is retried on the next reconnect, whatever else
		// changed: connectivity is not part of the fingerprint.
		if (outcome && typeof outcome === 'object' && 'kind' in outcome && outcome.kind === 'offline')
			seen.delete(args[0]);
		// Do not lose catalog or checkout-exit emissions consumed while a pass awaited its guards.
		if (
			typeof reason === 'string' &&
			[
				'pos_cart.only_n_available',
				'pos_products.out_of_stock',
				'catalog_changed',
				'in_checkout',
				'register_changed',
				'session_changed',
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
					!orderLocked(payload, fresh, deps, inputs.settings.priceNumDecimals, { ignoreCheckout });
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
					const current = () =>
						!stopped && pass === epoch && rates.ready && records.some((r) => r.uuid === uuid);
					const fresh = record.getLatest();
					const flag = wooMetaCarrier.vatExempt(fresh.payload.meta_data);
					const key = fingerprint(fresh);
					const repair = needsTaxRepair(fresh.payload, lastFlag.get(uuid));
					if (!repair) lastFlag.set(uuid, flag);
					else if (repaired.get(uuid) !== key && (!needsReferences(fresh) || references.ready)) {
						repaired.set(uuid, key);
						try {
							// The till's own toggle also trips this rule; equal meta and clean lines write nothing.
							if (!isActionRefusal(await deps.repairTaxExempt(fresh, flag, current)))
								lastFlag.set(uuid, flag);
						} catch (error) {
							deps.observe({ type: 'settlement.failed', uuid, at: deps.now(), error });
						}
						dirty = true;
						continue;
					}
					if (hasCoupons(fresh)) {
						if (orderLocked(fresh.payload, fresh, deps, inputs.settings.priceNumDecimals)) {
							// Preserve the in-flight fence when checkout is the only new exclusion.
							if (
								flights.has(uuid) &&
								!orderLocked(fresh.payload, fresh, deps, inputs.settings.priceNumDecimals, {
									ignoreCheckout: true,
								})
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
							if (!current()) return;
							seen.set(uuid, fingerprint(fresh));
							const allowed = (payload: OrderPayload, ignoreCheckout = false) =>
								current() &&
								!hasCoupons({ payload }) &&
								!orderLocked(payload, fresh, deps, inputs.settings.priceNumDecimals, {
									ignoreCheckout,
								});
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
			for (const uuid of new Set([...seen.keys(), ...lastFlag.keys(), ...repaired.keys()]))
				if (!records.some((r) => r.uuid === uuid)) {
					seen.delete(uuid);
					flights.delete(uuid);
					lastFlag.delete(uuid);
					repaired.delete(uuid);
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
	subscription.add(
		deps.reconnected$?.subscribe(() => {
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
