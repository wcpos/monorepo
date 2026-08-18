import { ReplaySubject } from 'rxjs';

import { createIdleCustomerDisplayState } from './create-snapshot';
import { CUSTOMER_DISPLAY_PROTOCOL, CUSTOMER_DISPLAY_PROTOCOL_VERSION } from './types';

import type { Observable } from 'rxjs';
import type { CustomerDisplaySnapshotV1, CustomerDisplayStateV1 } from './types';

/** Owns replay, sequencing, deduplication, and lifecycle-safe publication. */
export class CustomerDisplayBroadcast {
	private readonly subject = new ReplaySubject<CustomerDisplaySnapshotV1>(1);
	private latestSignature: string | undefined;
	private sequence = 0;
	private activeOwner: symbol | undefined;
	private releaseGeneration = 0;

	readonly snapshots$: Observable<CustomerDisplaySnapshotV1> = this.subject.asObservable();

	constructor() {
		this.publish(createIdleCustomerDisplayState());
	}

	/** Publishes a new immutable snapshot when its customer-visible state changed. */
	publish(state: CustomerDisplayStateV1, owner?: symbol): CustomerDisplaySnapshotV1 | undefined {
		if (owner) {
			this.activeOwner = owner;
			this.releaseGeneration += 1;
		}
		const signature = JSON.stringify(state);
		if (signature === this.latestSignature) return undefined;

		if (this.sequence === Number.MAX_SAFE_INTEGER) {
			throw new RangeError('Customer display sequence exceeded Number.MAX_SAFE_INTEGER');
		}
		this.latestSignature = signature;
		this.sequence += 1;
		const snapshot: CustomerDisplaySnapshotV1 = {
			...state,
			currency: { ...state.currency },
			items: state.items.map((item) => ({ ...item })),
			fees: state.fees.map((fee) => ({ ...fee })),
			shipping: state.shipping.map((shipping) => ({ ...shipping })),
			totals: { ...state.totals },
			protocol: CUSTOMER_DISPLAY_PROTOCOL,
			version: CUSTOMER_DISPLAY_PROTOCOL_VERSION,
			sequence: this.sequence,
		};
		Object.freeze(snapshot.currency);
		snapshot.items.forEach(Object.freeze);
		Object.freeze(snapshot.items);
		snapshot.fees.forEach(Object.freeze);
		Object.freeze(snapshot.fees);
		snapshot.shipping.forEach(Object.freeze);
		Object.freeze(snapshot.shipping);
		Object.freeze(snapshot.totals);
		Object.freeze(snapshot);
		this.subject.next(snapshot);
		return snapshot;
	}

	/**
	 * Clears the display. With an owner, stale clears are ignored and active clears are
	 * deferred to let a replacing publisher take over without an idle flicker; both return
	 * undefined. Without an owner, the idle snapshot is published and returned synchronously.
	 */
	clear(owner?: symbol): CustomerDisplaySnapshotV1 | undefined {
		if (owner) {
			if (this.activeOwner !== owner) return undefined;
			const generation = ++this.releaseGeneration;
			queueMicrotask(() => {
				if (this.activeOwner === owner && this.releaseGeneration === generation) {
					this.activeOwner = undefined;
					this.publish(createIdleCustomerDisplayState());
				}
			});
			return undefined;
		}

		this.activeOwner = undefined;
		this.releaseGeneration += 1;
		return this.publish(createIdleCustomerDisplayState());
	}
}

export const customerDisplayBroadcast = new CustomerDisplayBroadcast();
/** Read-only stream consumed by customer-display transports. */
export const customerDisplaySnapshots$ = customerDisplayBroadcast.snapshots$;
