/**
 * A single image entry, as it appears on either wire shape.
 */
interface ImageLike {
	src?: string;
}

/**
 * The two shapes a variation document can carry its image in.
 *
 * Woo's own `products/<parent>/variations` controller — the shape our wcpos/v1 lane
 * serves — emits a SINGULAR `image` object. The wcpos/v2 lane (plugin 1.10.0+)
 * hydrates variations through WooCommerce's PRODUCTS controller instead
 * (`Sync\Product_Serializer`: "Variations are serialized through the SAME products
 * controller as products"), and that controller emits an `images` ARRAY. A till
 * talks v2 to a 1.10.0+ store and v1 to a 1.9.x one, so both reach this client.
 */
interface ImageBearingPayload {
	images?: ImageLike[] | null;
	image?: ImageLike | null;
}

/**
 * Resolve the URL to display for a product or variation, whichever wire shape the
 * store's plugin version serves. `images[0]` wins when present — it is the shape the
 * current (v2) lane sends; `image` is the v1 fallback.
 */
export function resolveImageSrc(
	payload: ImageBearingPayload | null | undefined
): string | undefined {
	const fromArray = payload?.images?.[0]?.src;
	if (fromArray) {
		return fromArray;
	}
	return payload?.image?.src || undefined;
}
