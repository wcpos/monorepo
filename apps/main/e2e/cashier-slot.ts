import type { StoreVariant } from '../playwright.config';

export interface E2ECashierAuth {
	password: string;
	slot: number;
	username: string;
}

/**
 * PR runs use band A (1..8); all other runs use band B (9..16). Nothing has
 * serialized PR runs since the shared-store queue was removed (e21ddcf6c,
 * 2026-08-18): two PR runs in flight share band A, as two simultaneous non-PR
 * runs share band B (accepted residual).
 */
export function selectCashierSlot(eventName: string | undefined, normalizedIndex: number): number {
	const bandStart = eventName === 'pull_request' ? 1 : 9;
	return bandStart + normalizedIndex;
}

/**
 * 0-based index of the shard this process is running.
 *
 * Reads `E2E_SHARD_INDEX` (1-based, set by the CI matrix) before Playwright's
 * own `config.shard`. The gate no longer passes `--shard` — it hands each job an
 * explicit, duration-balanced list of spec files instead (see
 * `scripts/e2e-shard-plan.js`), which leaves `config.shard` undefined. Without
 * this every job would normalize to index 0, collapse onto ONE cashier slot, and
 * quietly destroy the per-shard scope isolation those slots exist to provide.
 */
export function currentShardIndex(config?: { shard?: { current: number } | null }): number {
	const fromEnv = Number(process.env.E2E_SHARD_INDEX);
	if (Number.isInteger(fromEnv) && fromEnv >= 1) return fromEnv - 1;
	return (config?.shard?.current ?? 1) - 1;
}

export function getE2ECashierAuth(
	variant: StoreVariant,
	normalizedIndex: number
): E2ECashierAuth | null {
	const password = process.env.E2E_CASHIER_PASS;
	if (variant !== 'pro' || !password) return null;
	const slot = selectCashierSlot(process.env.GITHUB_EVENT_NAME, normalizedIndex);
	return { password, slot, username: `e2e-cashier-${slot}` };
}

export function cashierAuthStateName(baseName: string, auth: E2ECashierAuth | null): string {
	return auth ? `${baseName}-cashier-${auth.slot}` : baseName;
}
