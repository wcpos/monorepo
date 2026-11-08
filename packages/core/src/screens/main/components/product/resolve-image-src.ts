/**
 * A single image entry on a variation.
 */
interface ImageLike {
	id?: number | string | null;
	src?: string | null;
}

/**
 * A variation carries its image as a singular `image` object.
 *
 * Plugin 1.10.0 sent an `images` array instead. That shape is not read here: this app's
 * floor is `MINIMUM_WCPOS_PLUGIN_VERSION` (2.0.0), so a 1.10.0 store cannot reach this code
 * (wcpos/woocommerce-pos-pro#477). The `1.11.x` lane still reads both.
 */
interface ImageBearingPayload {
	image?: ImageLike | null;
}

/**
 * The image ENTRY to display for a variation.
 *
 * The entry rather than just its `src`, because a cart line item carries the attachment `id`
 * alongside the URL and the server matches on it.
 */
export function resolveImageEntry(
	payload: ImageBearingPayload | null | undefined
): ImageLike | undefined {
	return payload?.image?.src ? payload.image : undefined;
}

/**
 * The URL to display for a variation.
 */
export function resolveImageSrc(
	payload: ImageBearingPayload | null | undefined
): string | undefined {
	return resolveImageEntry(payload)?.src || undefined;
}
