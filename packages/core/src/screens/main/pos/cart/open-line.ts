/**
 * Which cart line has its strip open: one per cart (2026-11-21 strip board), held by the cart
 * table. Rows report opening and closing; a row opening closes the one open before it.
 */
export type OpenLine = {
	/** `uuid` opened; whichever row was open before it closes through its own `close`. */
	opened: (uuid: string, close: () => void) => void;
	/** `uuid` closed or left the cart: it is no longer the open row. */
	closed: (uuid: string) => void;
	close: () => void; // whichever row is open: the cart scrolled
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
