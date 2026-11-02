// Pure helpers for global-setup's store login, kept free of Playwright so a
// plain Node harness can exercise them.

// The only failures a retry may cover: the store did not answer (run
// 36682500606, shard 4, while six setups hit dev-next at once; run 36712279626,
// shard 3, when the site probe timed out). Anything else is a real login failure
// and must fail at once.
const STORE_UNREACHABLE_SIGNATURES = [
	'store appears offline',
	// #2328: slow authorization probes remain a retryable store outage.
	'Authorization probes timed out',
	'SYNC121',
	'Failed to test authorization methods',
];

export function isStoreUnreachable(evidence: string): boolean {
	return (
		STORE_UNREACHABLE_SIGNATURES.some((signature) => evidence.includes(signature)) ||
		evidence
			.split('\n')
			.some((line) => line.includes('/wcpos/v2/site') && line.includes('timeout of'))
	);
}

// Waits before the second and third attempts: at most 3 attempts in total.
export const loginRetryDelaysMs = [15_000, 45_000];

// Six shards' first store requests, 30s apart each (#2321). 10s (#2303) still
// let their start saturate dev-next's ~6 php-fpm workers.
export function setupStaggerMs(normalizedShardIndex: number, ci: boolean): number {
	return ci ? normalizedShardIndex * 30_000 : 0;
}
