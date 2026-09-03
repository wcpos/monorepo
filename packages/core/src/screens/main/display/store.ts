type DisplayStore = {
	display?: ({ signaling?: unknown } & Record<string, unknown>) | null;
};

export function getDisplaySignaling(store: DisplayStore | null | undefined): string | null {
	const signaling = store?.display?.signaling;
	return typeof signaling === 'string' && signaling.trim() !== '' ? signaling : null;
}
