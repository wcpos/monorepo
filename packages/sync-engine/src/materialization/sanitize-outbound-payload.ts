import { sanitizeOutboundOrderPayload } from './sanitize-outbound-order-payload';
import { sanitizeOutboundProductPayload } from './sanitize-outbound-product-payload';

/**
 * The ONE per-collection outbound-sanitization dispatch used by every write-path
 * seam, so adding a collection sanitizer here applies it to plain enqueue,
 * coalesce, born-twice requeue, and dead-letter rebuild alike.
 */
export function sanitizeOutboundPayload<T extends Record<string, unknown>>(
	collectionName: string,
	payload: T
): T {
	if (collectionName === 'orders') return sanitizeOutboundOrderPayload(payload);
	if (collectionName === 'products' || collectionName === 'variations') {
		return sanitizeOutboundProductPayload(payload);
	}
	return payload;
}
