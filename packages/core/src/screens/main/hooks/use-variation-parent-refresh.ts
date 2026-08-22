import * as React from 'react';

import { engineCollection, useQueryRuntime } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { RemoteId } from '@wcpos/sync-core';

const parentLogger = getLogger(['wcpos', 'products', 'variation-parent']);

/**
 * The parent of the variation the engine just acknowledged, read from the
 * ACTIVE scope's resident — reported WITH the scope it was read in.
 *
 * The id is read from the resident rather than carried on the event because an
 * acknowledgement can re-materialize the variation from the server's response,
 * and `parent_id` joined the variation schema later than the collection itself
 * — a resident written before that learns its parent exactly here.
 *
 * The scope id travels with it because a product id means nothing on its own
 * here: reading the resident straddles an await, so by the time the caller acts
 * the cashier may have switched stores, and the caller must be able to tell that
 * the id it holds belongs to the scope it is about to fetch into. One resolution
 * of the scope, reported once — the same discipline `use-local-mutation` applies
 * to a barcode edit for the same reason.
 */
async function parentOfAcknowledgedVariation(
	engine: ReturnType<typeof useQueryRuntime>['engine'],
	recordId: string
): Promise<{ parentRemoteId: RemoteId; scopeId: string } | null> {
	const scope = engine.active() ?? (await engine.ready);
	const variations = engineCollection(scope.database, 'variations');
	const resident = await variations?.findOne(recordId).exec();
	const payload = (resident?.toJSON() as { payload?: Record<string, unknown> } | undefined)
		?.payload;
	const parentRemoteId = remoteIdOrNull(payload?.parent_id);
	return parentRemoteId === null ? null : { parentRemoteId, scopeId: scope.scopeId };
}

/**
 * Keep a variable product in step with its children.
 *
 * A variable product's price range is not a field it owns. The server recomputes
 * it per read from the visible children and injects it as
 * `_woocommerce_pos_variable_prices` (plugin `Sync/Variable_Prices.php`), and
 * blanks the parent's own price fields on the wire; `VariableProductPrice`
 * renders that meta entry. So editing a child's price changes what the parent's
 * row should show while leaving the parent's own record untouched — no pull lane
 * has any reason to fetch it, and the grid keeps rendering the pre-edit range.
 *
 * The repair is bound to the RECORD and to the engine's own acknowledgement,
 * NOT to the promise of one `write()` call, because both of the ways a write
 * reaches the server outlive such a promise:
 *
 *  - an edit made offline (or behind a slow push) is acknowledged whenever it
 *    eventually drains — minutes later, or after a relaunch. A caller waiting on
 *    `awaitWriteOutcome` has given up at its 15s timeout by then.
 *  - an unclaimed queued update that is superseded before it drains is
 *    coalesced into its replacement under a FRESH mutationId
 *    (`recordMutationQueue.ts`: "the intent fields change only during UNCLAIMED
 *    coalescing — and then under a fresh mutationId"). The original receipt can
 *    then never settle, so a price edit followed by, say, a barcode edit would
 *    push the price and refresh nothing.
 *
 * Listening for the acknowledgement of ANY write to that variation survives both:
 * whatever mutation actually lands names the same `recordId`, and it names it
 * whenever it lands.
 *
 * Every acknowledged variation write refreshes the parent, not only a price one.
 * The event carries no field list, and reconstructing one would mean a
 * recordId-keyed table of "this edit touched a price" — in-memory state that a
 * relaunch drops, which is the first failure above all over again. It is also
 * the honest invariant: the parent's SERVED projection is a function of its
 * children (all three price sub-ranges, and Woo's in-stock aggregation), so any
 * child write can move it. The cost is one targeted GET per deliberate,
 * user-initiated variation edit.
 */
export function useVariationParentRefresh(): void {
	const runtime = useQueryRuntime();

	React.useEffect(() => {
		const engine = runtime.engine;
		/** parentRemoteId → an acknowledgement landed while its fetch was in flight. */
		const inFlight = new Map<RemoteId, boolean>();
		let disposed = false;

		const refresh = async (parentRemoteId: RemoteId, scopeId: string): Promise<void> => {
			// The scope the parent id was RESOLVED in. Every path into this function
			// has crossed at least one await — the resident lookup, or a prior fetch
			// before the re-run below — and a store switch landing in that window
			// would otherwise declare the outgoing store's product against the
			// incoming scope, materializing a record that may not be in its catalog.
			if (engine.status().activeScopeId !== scopeId) return;

			if (inFlight.has(parentRemoteId)) {
				// A second child of the same parent was acknowledged after the in-flight
				// fetch was issued, so that response cannot be assumed to include this
				// edit. Re-run once when it settles instead of racing it.
				inFlight.set(parentRemoteId, true);
				return;
			}
			inFlight.set(parentRemoteId, false);

			const handle = engine.require({
				id: `variation-parent:refresh:${parentRemoteId}`,
				collection: 'products',
				kind: 'targeted-records',
				remoteIds: [parentRemoteId],
				// The parent was very likely fetched moments ago — it is the row the
				// edited variation is nested under — so an unforced requirement would be
				// served straight from the dedupe window, with the stale range.
				forceRefresh: true,
			});

			try {
				await handle.ready;
			} catch (error) {
				// Background repair of a derived display value: logged, never toasted.
				parentLogger.error('Failed to refresh variable product price range', {
					code: ERROR_CODES.PRODUCT_UNEXPECTED,
					context: { parentId: String(parentRemoteId), error: getErrorMessage(error) },
				});
			} finally {
				handle.release();
			}

			const acknowledgedAgain = inFlight.get(parentRemoteId);
			inFlight.delete(parentRemoteId);
			if (acknowledgedAgain && !disposed) await refresh(parentRemoteId, scopeId);
		};

		const unsubscribe = engine.events((event) => {
			if (event.type !== 'write-acknowledged' && event.type !== 'write-ack-rematerialized') {
				return;
			}
			if (event.collection !== 'variations') return;
			const recordId = event.recordId;
			if (!recordId) return;

			void (async () => {
				const resolved = await parentOfAcknowledgedVariation(engine, recordId);
				if (!resolved || disposed) return;
				await refresh(resolved.parentRemoteId, resolved.scopeId);
			})().catch((error: unknown) => {
				parentLogger.error('Failed to resolve the parent of an acknowledged variation write', {
					code: ERROR_CODES.PRODUCT_UNEXPECTED,
					context: { recordId, error: getErrorMessage(error) },
				});
			});
		});

		return () => {
			disposed = true;
			unsubscribe();
		};
	}, [runtime]);
}
