/**
 * A single image entry, as it appears on either wire shape.
 */
interface ImageLike {
	id?: number | string | null;
	src?: string | null;
}

/**
 * The two shapes a variation document can carry its image in.
 *
 * Every lane sends a SINGULAR `image` object, except plugin 1.10.0: its wcpos/v2 lane
 * hydrated variations through WooCommerce's PRODUCTS controller, which emits an `images`
 * ARRAY. Plugin 1.10.1 restored `image` on 2026-08-25. This lane's floor is still 1.10.0,
 * so both shapes can reach this client (wcpos/woocommerce-pos-pro#477).
 */
interface ImageBearingPayload {
	images?: ImageLike[] | null;
	image?: ImageLike | null;
}

/**
 * The image ENTRY to display, whichever wire shape the store's plugin version serves.
 * `images[0]` wins when present: only a 1.10.0 store sends it. `image` is what every other
 * store sends.
 *
 * The entry rather than just its `src`, because a cart line item carries the attachment `id`
 * alongside the URL and the server matches on it.
 */
export function resolveImageEntry(
	payload: ImageBearingPayload | null | undefined
): ImageLike | undefined {
	const fromArray = payload?.images?.[0];
	if (fromArray?.src) {
		return fromArray;
	}
	return payload?.image?.src ? payload.image : undefined;
}

/**
 * Resolve the URL to display for a product or variation, whichever wire shape the store's
 * plugin version serves.
 */
export function resolveImageSrc(
	payload: ImageBearingPayload | null | undefined
): string | undefined {
	return resolveImageEntry(payload)?.src || undefined;
}
