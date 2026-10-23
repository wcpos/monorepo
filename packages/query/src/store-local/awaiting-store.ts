import { combineLatest } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { observePendingCompletions } from './completion-journal';
import { type MoneyCommandEntry, observeMoneyJournal } from './money-commands';

import type { StoreLocalDatabase } from '../reads/store-local';

/**
 * Whether the store has still to hear a sale the till has taken (ADR 0040 Decided 1 rule 1: the
 * cashier is never unaware). The mark is never read from the order STATUS: on reconnect the
 * still-unpaid server document is adopted before the record lands, so the status flickers. Not
 * every sent entry marks: an online sale's POST is an open sent entry for its round trip too and
 * would flash "awaiting store" on every sale, so only a DEFERRED record (sent, no revision) does.
 * A completed offline sale stays marked through its re-send by the attempt's `awaitingAdoption`,
 * which ends only when the store session finishes the sale.
 */
export function awaitsStore({
	attempt,
	entries,
}: {
	attempt: { awaitingAdoption?: true } | undefined;
	entries: readonly Pick<MoneyCommandEntry, 'sentAt' | 'sentRevision'>[];
}): boolean {
	return (
		attempt?.awaitingAdoption === true ||
		entries.some((entry) => entry.sentAt !== null && entry.sentRevision === null)
	);
}

const sameSet = (left: ReadonlySet<string>, right: ReadonlySet<string>) =>
	left.size === right.size && [...left].every((uuid) => right.has(uuid));

/** The uuids of every order awaiting the store, live; emits only when the set changes. */
export function observeAwaitingStore(storeDB: StoreLocalDatabase) {
	return combineLatest([observePendingCompletions(storeDB), observeMoneyJournal(storeDB)]).pipe(
		map(([pending, journal]) => {
			const byOrder = new Map<string, MoneyCommandEntry[]>();
			for (const entry of journal)
				byOrder.set(entry.orderUuid, [...(byOrder.get(entry.orderUuid) ?? []), entry]);
			const uuids = new Set([...Object.keys(pending), ...byOrder.keys()]);
			return new Set(
				[...uuids].filter((uuid) =>
					awaitsStore({ attempt: pending[uuid], entries: byOrder.get(uuid) ?? [] })
				)
			) as ReadonlySet<string>;
		}),
		distinctUntilChanged(sameSet)
	);
}
