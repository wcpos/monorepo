let lastActivityMs = 0;
export function markUserActivity(nowMs: number = Date.now()): void {
	lastActivityMs = nowMs;
}
export function lastUserActivityMs(): number {
	return lastActivityMs;
}
