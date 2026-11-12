/**
 * The registers the web E2E suite may sell on, and the picker step that binds a device to one.
 *
 * The app auto-binds a device only when the store lists exactly one register
 * (`use-register-binding.ts`); with two it shows the picker. dev-pro store 24128 also lists
 * ui-climb's "Climb Register", which the climb needs and keeps, so the suite picks its own
 * register by name and never opens a session on any other (front desk, 2026-11-12; the native
 * twin is `ensure-pos-ready.yml`, monorepo#3522). Which register is bound comes from the app:
 * the bar's place states its id (`data-register-id`), and the app's own register reads supply
 * the name for that id (#3535).
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

/** One page's register reads: every register name the app was told, by id. `observe` never throws or rejects. */
export interface RegisterReadRecorder {
	/** `route` is `wcposRestRoute(url)`; `body` is the response's json() promise. */
	observe(route: string | null | undefined, body: () => Promise<unknown>): void;
	/** Names by id from every list and single read so far, and whether a list read resolved with at most one row. */
	current(): { names: ReadonlyMap<string, string>; smallList: boolean };
	/** Resolves when every body observed so far has settled (for tests; never rejects). */
	settled(): Promise<void>;
}

export function createRegisterReadRecorder(): RegisterReadRecorder {
	const names = new Map<string, string>();
	let smallList = false;
	const pending: Promise<void>[] = [];
	return {
		observe(route, body) {
			const isList = route === '/wcpos/v2/registers';
			const id = /^\/wcpos\/v2\/registers\/([^/]+)$/.exec(route ?? '')?.[1];
			if (!isList && (!id || id === 'health')) return;
			pending.push(
				(async () => {
					try {
						const value = await body();
						if (isList && Array.isArray(value) && value.length <= 1) smallList = true;
						const rows = isList ? (Array.isArray(value) ? value : []) : [value];
						for (const row of rows) {
							if (typeof row?.id === 'string' && typeof row?.name === 'string')
								names.set(row.id, row.name);
						}
					} catch {
						// An unreadable body changes no recorded names.
					}
				})()
			);
		},
		current: () => ({ names, smallList }),
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

/** A register id as the app's bar states it: a UUID, or null for anything else (missing, empty, malformed). */
export function registerIdOf(attribute: string | null | undefined): string | null {
	return attribute &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attribute)
		? attribute
		: null;
}

/**
 * The register the bar says this device is bound to. Null when the bar states no valid id, or when no
 * read named that id (name unknown: the guard waits for it, then throws).
 */
export function boundRegister(
	attribute: string | null | undefined,
	names: ReadonlyMap<string, string>
): RegisterName | null {
	const id = registerIdOf(attribute);
	const name = id ? names.get(id) : undefined;
	return id && name !== undefined ? { id, name } : null;
}

/** Throws unless the bar still states `decidedId`: an in-page store switch between the check and the open. */
export function assertStillBound(decidedId: string, attribute: string | null | undefined): void {
	if (registerIdOf(attribute) !== decidedId)
		throw new Error(
			`[register] the bar changed register before the session opened: decided "${decidedId}", now "${registerIdOf(attribute) ?? 'none'}"`
		);
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
