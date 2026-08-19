/**
 * The Woo driver's document-key derivation.
 *
 * ADR 0029: identities are minted/parsed only inside the driver. These
 * `woo-<entity>:<n>` keys are the driver's stable storage keys for server-born
 * records — derived from the driver identity (`RemoteId`) and never assembled
 * ad hoc by engine or app code.
 */

import { type RemoteId, wooIdOf } from './remoteIdCodec';

export function orderDocumentId(remoteId: RemoteId): string {
	return `woo-order:${wooIdOf(remoteId)}`;
}

export function productDocumentId(remoteId: RemoteId): string {
	return `woo-product:${wooIdOf(remoteId)}`;
}

export function variationDocumentId(remoteId: RemoteId): string {
	return `woo-variation:${wooIdOf(remoteId)}`;
}

export function customerDocumentId(remoteId: RemoteId): string {
	return `woo-customer:${wooIdOf(remoteId)}`;
}

/** The catalog document key for either catalog entity — dispatches to product/variation. */
export function catalogDocumentId(entity: 'product' | 'variation', remoteId: RemoteId): string {
	return entity === 'variation' ? variationDocumentId(remoteId) : productDocumentId(remoteId);
}

/**
 * The stable storage key for a tax rate. Unlike the other six collections (which key
 * by the server-stamped _woocommerce_pos_uuid), tax rates INTENTIONALLY key by their
 * Woo id — the single principled exception to uniform uuid identity (ADR 0009): tax
 * rates are pure-server-pull (never POS-authored), so the uuid's born-local
 * reconciliation purpose doesn't apply, and they have no native WC meta store to stamp.
 * This is NOT scaffolding awaiting a flip.
 */
export function taxRateDocumentId(remoteId: RemoteId): string {
	return `woo-tax-rate:${wooIdOf(remoteId)}`;
}

/** `woo-category:<n>` / `woo-brand:<n>` / `woo-tag:<n>` — the stable document id derived from the Woo id. */
export function referenceDocumentId(prefix: string, remoteId: RemoteId): string {
	return `${prefix}:${wooIdOf(remoteId)}`;
}
