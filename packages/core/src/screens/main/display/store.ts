/** The broadcast contract major this client implements (wiki: customer-display-broadcast). */
export const DISPLAY_CONTRACT = 1;

/**
 * Written onto a store when the server stops advertising the display capability
 * (Pro deactivated or downgraded): the schema has no nullable union, and a
 * missing field is otherwise left untouched by the server-owned patch.
 */
export const DISPLAY_CAPABILITY_REVOKED = { contract: 0, signaling: '' } as const;

type DisplayStore = {
	display?: ({ contract?: unknown; signaling?: unknown } & Record<string, unknown>) | null;
};

export function getDisplaySignaling(store: DisplayStore | null | undefined): string | null {
	const display = store?.display;
	if (!display || display.contract !== DISPLAY_CONTRACT) return null;
	const signaling = display.signaling;
	return typeof signaling === 'string' && signaling.trim() !== '' ? signaling : null;
}
