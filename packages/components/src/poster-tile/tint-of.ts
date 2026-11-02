/** One of the six tile tints, `bg-tile-tint-0` … `bg-tile-tint-5` (`apps/main/global.css`). */
export type Tint = 0 | 1 | 2 | 3 | 4 | 5;

const TINTS = 6;

/**
 * Which tint a tile without a picture gets: the one place the rule lives (spec § No picture,
 * wcpos/roadmap `docs/specs/2026-10-12-pos-product-tile-poster-spec.md`). A number is its value
 * modulo six; a string is the sum of its UTF-16 code units modulo six, so the same key always
 * gets the same tint. The key is the product's first category id (a variation's parent's), or
 * its name when it has no category; a term's is its id.
 */
export function tintOf(key: number | string): Tint {
	let n = 0;
	if (typeof key === 'number') {
		n = Number.isFinite(key) ? Math.trunc(key) : 0;
	} else {
		for (let i = 0; i < key.length; i += 1) n += key.charCodeAt(i);
	}
	return (((n % TINTS) + TINTS) % TINTS) as Tint;
}
