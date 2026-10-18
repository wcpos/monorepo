import { combineLatest, type Observable } from 'rxjs';

import {
	activeAwaitingCustomer,
	derive,
	hasLiveSettlementLeg,
	readLedger,
} from '@wcpos/order-math';

import { enqueueOrderMutation } from '../hooks/order-mutation-queue';
import { readQuickDiscountIntent } from '../hooks/quick-discount';

import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { CartConfigInputs, OrderPayload } from './cart-config-for-order';

export type RatesReady = { ready: boolean; generation: number };
export type SettlementDiagnostic = { type: string; uuid: string; at: number; error?: unknown };
interface Deps {
	inputs$: Observable<CartConfigInputs>;
	// null is a rebind: discard old records AND queued work before accepting the new scope.
	openOrders$: Observable<CurrentOrderRecord[] | null>;
	ratesReady$: Observable<RatesReady>;
	serverOwnsMoney: (uuid: string) => boolean;
	orderSaveState: (uuid: string) => { kind: string } | null;
	inCheckout: (uuid: string) => boolean;
	settle: (
		uuid: string,
		record: CurrentOrderRecord,
		allowed: (payload: OrderPayload) => boolean
	) => Promise<unknown>;
	now: () => number;
	observe: (event: SettlementDiagnostic) => void;
}

function closed(payload: OrderPayload, record: CurrentOrderRecord, deps: Deps, dp: number) {
	const payment = derive(payload.total, readLedger(payload.meta_data), [], { dp });
	return Boolean(
		(record as { isNew?: boolean }).isNew ||
		hasLiveSettlementLeg(payload.meta_data) ||
		activeAwaitingCustomer(payload.meta_data) ||
		(Number(payment.paid) > 0 && Number(payment.balance) <= 0) ||
		['rejected', 'conflicted', 'needs-revision'].includes(
			deps.orderSaveState(record.uuid)?.kind ?? ''
		) ||
		deps.inCheckout(record.uuid) ||
		deps.serverOwnsMoney(record.uuid) ||
		payload.meta_data?.some(
			({ key, value }) => key === '_wcpos_money_owner' && value === 'server'
		) ||
		payload.coupon_lines?.some((line) => line.code != null && !readQuickDiscountIntent(line))
	);
}

/** One sequential drain; only content (never aggregate money or revision) invalidates a pass. */
export function createSettlementCoordinator(deps: Deps): { stop(): void } {
	let records: CurrentOrderRecord[] = [];
	let inputs: CartConfigInputs;
	let rates: RatesReady = { ready: false, generation: 0 };
	let epoch = 0;
	let stopped = false;
	let running = false;
	let dirty = false;
	const seen = new Map<string, string>();
	const fingerprint = (record: CurrentOrderRecord) => {
		const p = record.payload;
		return JSON.stringify([
			p.line_items,
			p.fee_lines,
			p.shipping_lines,
			p.coupon_lines,
			p.billing,
			p.shipping,
			p.status,
			p.meta_data?.filter(
				({ key }) => key === '_woocommerce_pos_tax_based_on' || key === '_wcpos_money_owner'
			),
			closed(p, record, deps, inputs.settings.priceNumDecimals),
			inputs,
			rates.generation,
		]);
	};
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
					if (seen.get(uuid) === fingerprint(record.getLatest())) continue;
					try {
						await enqueueOrderMutation(uuid, async (slot) => {
							const fresh = (slot.order ?? record).getLatest();
							const current = () =>
								!stopped && pass === epoch && rates.ready && records.some((r) => r.uuid === uuid);
							if (!current()) return;
							seen.set(uuid, fingerprint(fresh));
							const allowed = (payload: OrderPayload) =>
								current() && !closed(payload, fresh, deps, inputs.settings.priceNumDecimals);
							if (allowed(fresh.payload)) await deps.settle(uuid, fresh, allowed);
						});
					} catch (error) {
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
			inputs = nextInputs;
			rates = nextRates;
			if (!rates.ready) seen.clear();
			if (nextRecords === null) {
				epoch++;
				seen.clear();
			}
			records = nextRecords ?? [];
			for (const uuid of seen.keys()) if (!records.some((r) => r.uuid === uuid)) seen.delete(uuid);
			dirty = true;
			void drain();
		}
	);
	return {
		stop() {
			stopped = true;
			epoch++;
			subscription.unsubscribe();
			seen.clear();
			records = [];
		},
	};
}
