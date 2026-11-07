/**
 * The store and register a docs shoot on demo uses (roadmap#539, #540, #514). Front desk ruling:
 * docs shoots on demo use register `944ef7dc` only, on store 1234, one register open at a time;
 * demo's other registers hold people's open sessions and are never opened or closed by a test.
 */
import { type APIRequestContext, expect, type Page, type TestInfo } from '@playwright/test';

import { log } from '@wcpos/utils/logger';

import { getStoreUrl, type StoreAuthorization } from '../fixtures';
import { resolveProbeOptions } from '../probe-credential';
import { openCashierSheet, posLayout, showPhoneTab } from './open-register';

type Row = Record<string, unknown>;

/** The docs store on demo (the front desk's ruling above). */
export const DOCS_STORE_ID = '1234';
/** The docs register's id begins with this; the full id lives on demo, which this code never reads. */
export const DOCS_REGISTER_PREFIX = '944ef7dc';

/** A GET on the store's REST API, pretty permalinks first, then `?rest_route=`. */
async function storeGet(
	request: APIRequestContext,
	storeUrl: string,
	route: string,
	options: { headers: Record<string, string>; params: Record<string, string> },
	params: Record<string, string>
): Promise<Row[]> {
	const base = storeUrl.replace(/\/+$/, '');
	const all = { ...options.params, ...params };
	let response = await request.get(`${base}/wp-json${route}`, { ...options, params: all });
	if (response.status() === 404) {
		response = await request.get(`${base}/index.php`, {
			...options,
			params: { ...all, rest_route: route },
		});
	}
	if (!response.ok()) throw new Error(`GET ${route} answered ${response.status()}`);
	return (await response.json()) as Row[];
}

async function probeOptions(
	request: APIRequestContext,
	info: TestInfo,
	storeAuthorization: () => StoreAuthorization | null
) {
	const storeUrl = getStoreUrl(info);
	const options = await resolveProbeOptions(request, storeUrl, storeAuthorization, {
		route: '/wcpos/v2/orders',
	});
	return { storeUrl, options };
}

/**
 * Put the app on the store through the cashier sheet, as a cashier would. Its name comes from the
 * app's own read (`/wcpos/v2/cashier/<id>`), the only key to its row: a row's testID is a local id.
 */
export async function showStore(
	page: Page,
	request: APIRequestContext,
	info: TestInfo,
	storeAuthorization: () => StoreAuthorization | null,
	storeId: string = DOCS_STORE_ID
): Promise<void> {
	const { storeUrl, options } = await probeOptions(request, info, storeAuthorization);
	const me = (await storeGet(request, storeUrl, '/wp/v2/users/me', options, {})) as unknown as Row;
	const cashier = (await storeGet(
		request,
		storeUrl,
		`/wcpos/v2/cashier/${String(me.id)}`,
		options,
		{}
	)) as unknown as { stores?: Row[] };
	const store = cashier.stores?.find((row) => String(row.id) === storeId);
	if (!store) throw new Error(`store ${storeId} is not among the cashier's stores`);
	// The sheet's door is the drawer only with a bound register; with none, the store switch.
	await openCashierSheet(page, 'user-sheet-store-switch');
	await page.getByTestId('user-sheet-store-switch').click();
	const rows = page
		.getByTestId('user-sheet-store-band')
		.locator('[data-testid^="user-sheet-store-"]');
	await expect(rows.first()).toBeVisible({ timeout: 15_000 });
	const index = (await rows.allTextContents()).findIndex((text) => text.trim() === store.name);
	if (index < 0) throw new Error(`the sheet shows no row for store ${storeId}`);
	const row = rows.nth(index);
	if ((await row.getAttribute('aria-checked')) === 'true') {
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('user-sheet')).toBeHidden({ timeout: 15_000 });
	} else {
		await row.click();
		// Nothing is bound, so the confirm offers no drawer to carry: only Switch.
		await page.getByTestId('switch-confirm-confirm').click();
		// The sheet closes only once the switch landed; the overlay may not have shown yet.
		await expect(page.getByTestId('user-sheet')).toBeHidden({ timeout: 120_000 });
		await expect(page.getByTestId('store-switch-overlay')).toHaveCount(0, { timeout: 120_000 });
		await expect(page.getByTestId('search-products').first()).toBeVisible({ timeout: 120_000 });
		// The sheet closes before the till takes the new store: its bar names it once it has.
		const place = page.getByTestId('register-bar-place').first();
		await expect(place).toHaveText(String(store.name), { timeout: 120_000 });
	}
	log.info(`[register] on store ${storeId}`);
}

/**
 * Pick the docs register on the picker. It must be free: no open or counting session, and its row
 * carrying no session or only a closed one; otherwise this throws before any click. Ids only.
 */
export async function pickDocsRegister(
	page: Page,
	request: APIRequestContext,
	info: TestInfo,
	storeAuthorization: () => StoreAuthorization | null
): Promise<void> {
	const { storeUrl, options } = await probeOptions(request, info, storeAuthorization);
	const store = { store_id: DOCS_STORE_ID };
	const registers = await storeGet(request, storeUrl, '/wcpos/v2/registers', options, store);
	const register = registers.find((row) => String(row.id).startsWith(DOCS_REGISTER_PREFIX));
	if (!register)
		throw new Error(`register ${DOCS_REGISTER_PREFIX} is not on store ${DOCS_STORE_ID}`);
	const id = String(register.id);
	const lists = await Promise.all(
		['open', 'counting'].map((status) =>
			storeGet(request, storeUrl, '/wcpos/v2/sessions', options, {
				...store,
				register_id: id,
				status,
			})
		)
	);
	const session = register.session as { status?: unknown } | null | undefined;
	const rowFree = !session || session.status === 'closed';
	if (!rowFree || lists.some((list) => list.length > 0)) {
		throw new Error(`register ${DOCS_REGISTER_PREFIX} has an open or counting session`);
	}
	if ((await posLayout(page)) === 'phone') await showPhoneTab(page, 'cart');
	const row = page.getByTestId(`register-picker-row-${id}`);
	await expect(row).toBeVisible({ timeout: 60_000 });
	await row.click();
	await expect(row).toBeHidden({ timeout: 60_000 });
	// On a phone the card stays mounted off-screen: attached, not visible, is the signal.
	await expect(page.getByTestId('open-register-card')).toBeAttached({ timeout: 60_000 });
	log.info(`[register] ${info.titlePath.at(-2)}: picked ${id}`);
}
