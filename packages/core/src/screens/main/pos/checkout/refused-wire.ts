import isEqual from 'lodash/isEqual';
import omit from 'lodash/omit';

import { sanitizeOutboundOrderPayload } from '@wcpos/sync-engine';

/** What a refused order save put on the wire, minus the keys Pay never changes. */
export type RefusedWire = Record<string, unknown>;

/**
 * The enqueue pipeline's own outbound seam, so the resident projects exactly as the
 * queue row did (an empty `billing.email` is dropped on both sides). The drain settles
 * a superseded dead letter on the same wire projection (#2946) and ignores `meta_data`.
 * `status` goes too: an order UPDATE never sends it (ADR 0040) while a dead-lettered
 * CREATE does, and Pay never changes it.
 */
export function refusedWireOf(payload: Record<string, unknown> | null | undefined): RefusedWire {
	return omit(sanitizeOutboundOrderPayload(payload ?? {}), ['status', 'meta_data']);
}

/**
 * Changed means some field the refusal carried now reads differently on the resident.
 * A refused row is often sparse (a cart edit enqueues only its changes), so the fields
 * it did not carry are not compared: they are not what the store refused. A refusal
 * whose payload is unknown (`null`) or carried nothing Pay could change counts as
 * changed, and Pay may retry it.
 */
export function orderChangedSinceRefusal(
	current: Record<string, unknown>,
	refused: RefusedWire | null
): boolean {
	if (refused === null) return true;
	const keys = Object.keys(refused);
	if (keys.length === 0) return true;
	const wire = refusedWireOf(current);
	return keys.some((key) => !isEqual(wire[key], refused[key]));
}
