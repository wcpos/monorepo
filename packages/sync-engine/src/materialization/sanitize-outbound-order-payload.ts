import { stripNonStringMetaDisplayFields } from './strip-order-meta-display';

/**
 * The ONE outbound sanitization for an order payload — everything the wc/v3
 * schema refuses, removed in the enqueue pipeline rather than at each call site.
 *
 * Why it lives here and not in the UI hook that happens to build the payload
 * (#832): a dead-lettered mutation is recovered by REBUILDING its payload from
 * the current resident record. If a sanitizer lives in the caller, the rebuild
 * skips it and reproduces the exact 400 that stranded the sale in the first
 * place. Anything the server will permanently refuse belongs on this path, where
 * both a normal write and a requeue pass through it.
 *
 * Sanitizers, each pinned to the failure it prevents:
 *  - non-string `display_key` / `display_value` in meta (the typed-meta 400);
 *  - an EMPTY `billing.email`. A guest sale has no email and stores '' locally;
 *    wc/v3 answers `rest_invalid_email` (400), which dead-letters the CREATE and
 *    strands the order — every later update then 404s. Absent means "no email",
 *    which is the truth. This is the #786 / woocommerce-pos#1308 incident.
 */
export function sanitizeOutboundOrderPayload<T extends Record<string, unknown>>(payload: T): T {
	return stripEmptyBillingEmail(stripNonStringMetaDisplayFields(payload));
}

function stripEmptyBillingEmail<T extends Record<string, unknown>>(payload: T): T {
	const billing = payload.billing;
	if (
		typeof billing !== 'object' ||
		billing === null ||
		Array.isArray(billing) ||
		(billing as Record<string, unknown>).email !== ''
	) {
		return payload;
	}
	const { email: _empty, ...rest } = billing as Record<string, unknown>;
	return { ...payload, billing: rest };
}
