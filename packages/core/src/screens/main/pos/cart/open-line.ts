/**
 * Which cart line has its strip open: one per cart (the 2026-11-21 strip board). The cart table
 * holds one; a row says here when it opens and when it closes, and a row opening closes the row
 * that was open before it. The rows keep their own motion; only this fact is shared.
 */
export type OpenLine = {
	/** `uuid` opened; whichever row was open before it closes through its own `close`. */
	opened: (uuid: string, close: () => void) => void;
	/** `uuid` closed or left the cart: it is no longer the open row. */
	closed: (uuid: string) => void;
	/** Close whichever row is open (the cart scrolled). */
	close: () => void;
};

export function createOpenLine(): OpenLine {
	let current: { uuid: string; close: () => void } | null = null;
	return {
		opened: (uuid, close) => {
			const before = current;
			// Set first: the row closing reports `closed` for itself, which must not clear this one.
			current = { uuid, close };
			if (before && before.uuid !== uuid) before.close();
		},
		closed: (uuid) => {
			if (current?.uuid === uuid) current = null;
		},
		close: () => current?.close(),
	};
}
