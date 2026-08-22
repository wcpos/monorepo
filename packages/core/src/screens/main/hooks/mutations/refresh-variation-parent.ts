import { awaitWriteOutcome } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

const parentLogger = getLogger(['wcpos', 'mutations', 'variation-parent']);

/**
 * The variation fields a variable parent's displayed price range is derived FROM.
 *
 * The range is not a field the parent owns: the server recomputes it per read
 * from the visible children and injects it as `_woocommerce_pos_variable_prices`
 * (plugin `Sync/Variable_Prices.php`; rendered by `VariableProductPrice`). So a
 * child price edit changes what the parent's row *should* show while leaving the
 * parent's own record untouched — no pull lane has any reason to fetch it, and
 * the grid keeps rendering the pre-edit range until something asks for the
 * parent by id.
 */
const PARENT_PRICE_RANGE_FIELDS = ['regular_price', 'sale_price', 'price'] as const;

export function affectsParentPriceRange(changes: Record<string, unknown> | undefined): boolean {
	if (!changes) return false;
	return PARENT_PRICE_RANGE_FIELDS.some((field) =>
		Object.prototype.hasOwnProperty.call(changes, field)
	);
}

function parentRemoteIdOf(document: unknown) {
	const payload = (document as { payload?: Record<string, unknown> } | null | undefined)?.payload;
	return remoteIdOrNull(payload?.parent_id);
}

function latestOf(document: unknown) {
	const getLatest = (document as { getLatest?: () => unknown } | null | undefined)?.getLatest;
	return typeof getLatest === 'function' ? getLatest.call(document) : document;
}

/**
 * Re-fetch the variable parent after a child variation price write.
 *
 * The wait on the write outcome is load-bearing: the range is computed at SERVE
 * time, so a refresh issued at enqueue time would fetch the pre-edit range and
 * overwrite the parent resident with it. A write that never lands — offline, or
 * rejected — resolves nothing here: `awaitWriteOutcome` rejects, this returns,
 * and the parent stays as it was. Conflicts and rejections are surfaced by the
 * mutation funnel and the engine conflict surface, so nothing is reported twice.
 */
export async function refreshVariationParent(
	engine: Pick<RxdbSyncEngine, 'events' | 'sync' | 'require'>,
	{
		document,
		changes,
		mutationId,
	}: { document: unknown; changes: Record<string, unknown> | undefined; mutationId: string }
): Promise<void> {
	if (!affectsParentPriceRange(changes)) return;

	try {
		await awaitWriteOutcome(engine, mutationId);
	} catch {
		return;
	}

	// Read the parent AFTER the acknowledgement, which can re-materialize the
	// variation from the server's response: `parent_id` joined the variation
	// schema later than the collection itself, so a resident stored before that
	// carries none until it is re-read, and the pre-ack payload would point at
	// nothing. The pre-ack value is the fallback, not the source.
	const parentRemoteId = parentRemoteIdOf(latestOf(document)) ?? parentRemoteIdOf(document);
	if (parentRemoteId === null) return;

	const handle = engine.require({
		id: `variation-parent:refresh:${parentRemoteId}`,
		collection: 'products',
		kind: 'targeted-records',
		remoteIds: [parentRemoteId],
		// The parent was very likely fetched moments ago (it is the row the edited
		// variation is nested under), so an unforced requirement would be served
		// straight from the dedupe window — with the stale range.
		forceRefresh: true,
	});

	try {
		await handle.ready;
	} catch (error) {
		// Background repair of a derived display value: logged, never toasted.
		parentLogger.error('Failed to refresh variable product price range', {
			code: ERROR_CODES.PRODUCT_UNEXPECTED,
			context: {
				parentId: String(parentRemoteId),
				error: getErrorMessage(error),
			},
		});
	} finally {
		handle.release();
	}
}
