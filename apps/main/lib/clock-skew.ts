export interface ClockSkewResult {
	skewSeconds: number; // signed; positive = server clock ahead of device, negative = behind
	serverDate: string; // ISO string derived from the Date header
	deviceDate: string; // ISO string of the device midpoint estimate
}

export function evaluateClockSkew(input: {
	dateHeader: string | null;
	requestStartedAtMs: number;
	responseAtMs: number;
	thresholdSeconds?: number; // default 60
}): ClockSkewResult | null {
	if (input.dateHeader === null) return null;
	const serverMs = Date.parse(input.dateHeader);
	if (Number.isNaN(serverMs)) return null;

	const midpointMs = input.requestStartedAtMs + (input.responseAtMs - input.requestStartedAtMs) / 2;
	const skewSeconds = Math.round((serverMs - midpointMs) / 1_000);
	if (Math.abs(skewSeconds) <= (input.thresholdSeconds ?? 60)) return null;

	return {
		skewSeconds,
		serverDate: new Date(serverMs).toISOString(),
		deviceDate: new Date(midpointMs).toISOString(),
	};
}
