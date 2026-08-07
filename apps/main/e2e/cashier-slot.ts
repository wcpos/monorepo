import type { StoreVariant } from '../playwright.config';

export interface E2ECashierAuth {
	password: string;
	slot: number;
	username: string;
}

/** Stable run+shard assignment across the eight provisioned E2E cashiers. */
export function selectCashierSlot(runId: string, shardIndex: number): number {
	let hash = 0;
	for (const character of `${runId}:${shardIndex}`) {
		hash = Math.imul(hash, 31) + character.charCodeAt(0);
	}
	return ((hash >>> 0) % 8) + 1;
}

export function getE2ECashierAuth(
	variant: StoreVariant,
	shardIndex: number
): E2ECashierAuth | null {
	const password = process.env.E2E_CASHIER_PASS;
	if (variant !== 'pro' || !password) return null;
	const slot = selectCashierSlot(
		process.env.GITHUB_RUN_ID ?? process.env.E2E_RUN_ID ?? 'local',
		shardIndex
	);
	return { password, slot, username: `e2e-cashier-${slot}` };
}

export function cashierAuthStateName(baseName: string, auth: E2ECashierAuth | null): string {
	return auth ? `${baseName}-cashier-${auth.slot}` : baseName;
}
