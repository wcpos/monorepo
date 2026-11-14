/** "6 seconds / 3 min / 2 h": the unit and value for a span, shared by every age readout. */
export function relativeTimeParts(
	fromMs: number,
	toMs: number
): { unit: 'seconds' | 'minutes' | 'hours'; value: number } {
	const deltaMs = Math.max(0, toMs - fromMs);
	if (deltaMs < 60_000) return { unit: 'seconds', value: Math.round(deltaMs / 1000) };
	if (deltaMs < 60 * 60_000) return { unit: 'minutes', value: Math.round(deltaMs / 60_000) };
	return { unit: 'hours', value: Math.round(deltaMs / (60 * 60_000)) };
}
