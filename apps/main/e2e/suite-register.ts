/**
 * The registers the web E2E suite may sell on, and the picker step that binds a device to one.
 *
 * The app auto-binds a device only when the store lists exactly one register
 * (`use-register-binding.ts`); with two it shows the picker. dev-pro store 24128 also lists
 * ui-climb's "Climb Register", which the climb needs and keeps, so the suite picks its own
 * register by name and never opens a session on any other (front desk, 2026-11-12; the native
 * twin is `ensure-pos-ready.yml`, monorepo#3522).
 */
import { expect, type Page } from '@playwright/test';

import { log } from '@wcpos/utils/logger';

/** The suite's register on the E2E stores: matched whole, never as a prefix or substring. */
export const SUITE_REGISTER_NAME = 'Register';
/** The docs register's id begins with this; the full id lives on demo, which this code never reads. */
export const DOCS_REGISTER_PREFIX = '944ef7dc';

export interface RegisterName {
	id: string;
	name: string;
}

/** What a page's app has read about registers: the list, and the last single-register read. */
export interface RegisterReads {
	list?: RegisterName[];
	single?: RegisterName;
}

/** One page's register reads, kept in arrival order. `observe` never throws or rejects. */
export interface RegisterReadRecorder {
	/**
	 * `route` is `wcposRestRoute(url)`. `storeId` is the request's `store_id` query value, or null.
	 * `body` is the response's json() promise.
	 */
	observe(
		route: string | null | undefined,
		storeId: string | null,
		body: () => Promise<unknown>
	): void;
	/** The reads so far, or undefined before the first list or single read is recorded. */
	current(): RegisterReads | undefined;
	/** Resolves when every body observed so far has settled (for tests; never rejects). */
	settled(): Promise<void>;
}

export function createRegisterReadRecorder(): RegisterReadRecorder {
	let generation = 0;
	let singleTaken = false;
	let store: string | null | undefined;
	let list: RegisterName[] | undefined;
	let single: RegisterName | undefined;
	const pending: Promise<void>[] = [];
	return {
		observe(route, storeId, body) {
			const isList = route === '/wcpos/v2/registers';
			const id = /^\/wcpos\/v2\/registers\/([^/]+)$/.exec(route ?? '')?.[1];
			if (!isList && (!id || id === 'health' || !generation || singleTaken)) return;
			if (isList) {
				generation++;
				single = undefined;
				singleTaken = false;
				if (storeId !== store) list = undefined;
				store = storeId;
			} else singleTaken = true;
			const observed = generation;
			pending.push(
				(async () => {
					try {
						const row = (await body()) as RegisterName;
						if (observed !== generation) return;
						if (isList) list = Array.isArray(row) ? row : [];
						else if (typeof row?.id === 'string' && typeof row?.name === 'string')
							single = { id: row.id, name: row.name };
					} catch {
						// An unreadable body keeps only the same store's last list.
					}
				})()
			);
		},
		current: () => (generation ? { ...(list && { list }), ...(single && { single }) } : undefined),
		settled: async () => {
			await Promise.all(pending);
		},
	};
}

/** A register the suite created: named exactly `Register`, or the docs register on demo (by id). */
export function isSuiteRegister({ id, name }: RegisterName): boolean {
	return name === SUITE_REGISTER_NAME || String(id).startsWith(DOCS_REGISTER_PREFIX);
}

/**
 * The picker row to take, from each row's text. A row is the name, then its status badge
 * ("Abierta desde 10:11 PM · Demo Cashier") on a line of its own, so the name is the first line.
 * Throws, naming the rows seen, when none is the suite's: there is no fallback row.
 */
export function suiteRegisterRowIndex(rowTexts: readonly string[]): number {
	const names = rowTexts.map((text) => text.split('\n').find((line) => line.trim()) ?? '');
	const index = names.findIndex((name) => isSuiteRegister({ id: '', name }));
	if (index < 0)
		throw new Error(
			`[register] no register named "${SUITE_REGISTER_NAME}" on the picker; rows seen: ` +
				names.map((name) => `"${name}"`).join(', ')
		);
	return index;
}

/**
 * The register this device is bound to, from the bar's place and the register list the app read:
 * a one-register store's bar names only the store (its one register is the bound one), a larger
 * store's reads `Store · Register`. An empty list can use the app's single-register read.
 */
export function boundRegister<T extends RegisterName>(
	place: string,
	directory: readonly T[],
	single?: RegisterName
): T | RegisterName | null {
	const namesNone = !place.includes(' · ');
	const named = directory.filter(
		(row) => (directory.length === 1 && namesNone) || place.endsWith(` · ${row.name}`)
	);
	// "Store · A · Register" names "A · Register" before "Register": the longest name is the one.
	const bound = named.sort((a, b) => b.name.length - a.name.length)[0] ?? null;
	if (bound && single && bound.id !== single.id) return null;
	if (bound || directory.length > 0 || !single) return bound;
	return namesNone || place.endsWith(` · ${single.name}`) ? single : null;
}

const PICKER_ROWS = '[data-testid^="register-picker-row-"]';

/** Take the suite's row on the register picker, and wait for the picker to go. */
export async function pickSuiteRegister(page: Page, timeout: number): Promise<void> {
	// A phone keeps the picker on its Cart tab, mounted off-screen behind Products.
	const cartTab = page.getByTestId('pos-tab-cart').filter({ visible: true });
	if ((await cartTab.count()) > 0)
		await expect(async () => {
			await cartTab.click({ timeout: 5_000 });
			await expect(cartTab).toHaveAttribute('aria-selected', 'true', { timeout: 2_000 });
		}).toPass({ timeout: 30_000 });
	const rows = page.locator(PICKER_ROWS);
	await expect(rows.first()).toBeVisible({ timeout });
	const row = rows.nth(suiteRegisterRowIndex(await rows.allInnerTexts()));
	const id = (await row.getAttribute('data-testid'))?.replace('register-picker-row-', '');
	log.info(`[register] picker shown, picking the suite register ${id}`);
	await row.click();
	await expect(rows.first()).toBeHidden({ timeout });
}
