import { type Observable } from 'rxjs';
import { distinctUntilChanged, map, shareReplay } from 'rxjs/operators';

import { storeDatabase } from './ensure-local-document';
import { isDeferred, observeMoneyJournal } from './money-commands';

import type { StoreLocalDatabase } from '../reads/store-local';

/**
 * The orders whose sale the store has still to hear (ADR 0040 Decided 1 rule 1: the cashier is
 * never unaware): those with an open offline record (`isDeferred`). The mark lives exactly as
 * long as that record: `markSent` keeps `deferredAt` through the re-send, and the store's answer
 * settles (deletes) the entry. Never the order STATUS (on reconnect the still-unpaid server
 * document is adopted before the record lands, so it flickers), and never an online sale: its
 * POST, or an `unconfirmed` close the store already took, is not a sale the store has not heard.
 */
const shared = new WeakMap<object, Observable<ReadonlySet<string>>>();

const sameSet = (left: ReadonlySet<string>, right: ReadonlySet<string>) =>
	left.size === right.size && [...left].every((uuid) => right.has(uuid));

/** The awaiting uuids, live; ONE stream per store database, replaying its last set. */
export function observeAwaitingStore(storeDB: StoreLocalDatabase): Observable<ReadonlySet<string>> {
	const database = storeDatabase(storeDB);
	let stream = shared.get(database);
	if (!stream) {
		stream = observeMoneyJournal(storeDB).pipe(
			map((entries) => new Set(entries.filter(isDeferred).map((entry) => entry.orderUuid))),
			distinctUntilChanged(sameSet),
			shareReplay({ bufferSize: 1, refCount: true })
		);
		shared.set(database, stream);
	}
	return stream;
}
