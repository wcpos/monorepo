import type { StoreVariant } from '../playwright.config';

export interface E2ECashierAuth {
	password: string;
	slot: number;
	username: string;
}

/**
 * PR runs use band A (1..8); the deploy workflow's e2e-shared-store queue
 * serializes them. All other runs use band B (9..16). Accepted residual: two
 * simultaneous non-PR runs can share band B because that queue does not cover them.
 */
export function selectCashierSlot(eventName: string | undefined, normalizedIndex: number): number {
	const bandStart = eventName === 'pull_request' ? 1 : 9;
	return bandStart + normalizedIndex;
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
