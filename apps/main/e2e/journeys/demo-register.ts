/**
 * Picking a free register on demo before a docs shoot (roadmap#539, #540). Demo's stores carry
 * several registers, some with people's sessions open, so a shoot takes one nobody holds.
 */
import {
	type APIRequestContext,
	expect,
	type Page,
	type Request,
	type TestInfo,
} from '@playwright/test';

import { getStoreUrl, type StoreAuthorization } from '../fixtures';
import { resolveProbeOptions } from '../probe-credential';
import { posLayout, showPhoneTab } from './open-register';
import { wirePath } from './register-wire-stub';

type Row = Record<string, unknown>;

/** The app's own register list, settled to a value or an error so a missed request never rejects. */
export type RegistersRequest = Promise<{ value: Request } | { error: unknown }>;

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

/**
 * A register of the store's with no open or counting session, and whose row carries no session
 * or only a closed one (the row keeps its latest session after it closes). Registers with an open
 * or counting session belong to people, so none of them is ever picked; with none free this throws,
 * naming the count. Free registers with a `last_closure` come first, so the open card shows its
 * last-count chip; otherwise the store's order stands. Logs ids and counts only, never a body.
 */
async function freeRegisterId(
	request: APIRequestContext,
	testInfo: TestInfo,
	storeAuthorization: () => StoreAuthorization | null,
	storeId: string | null
): Promise<string> {
	const storeUrl = getStoreUrl(testInfo);
	const options = await resolveProbeOptions(request, storeUrl, storeAuthorization, {
		route: '/wcpos/v2/orders',
	});
	const store: Record<string, string> = storeId ? { store_id: storeId } : {};
	const registers = await storeGet(request, storeUrl, '/wcpos/v2/registers', options, store);
	const free: string[] = [];
	const ordered = [
		...registers.filter((register) => register.last_closure),
		...registers.filter((register) => !register.last_closure),
	];
	for (const register of ordered) {
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
		if (rowFree && lists.every((list) => list.length === 0)) free.push(id);
	}
	console.log(`[register] ${registers.length} register(s), free: ${free.join(', ') || 'none'}`);
	if (free.length === 0) {
		throw new Error(`all ${registers.length} register(s) have an open session; none is free`);
	}
	return free[0];
}

/** Armed before sign-in: the app's own register list names the store it reads (none on a single-store plugin). */
export function watchRegistersRequest(page: Page): RegistersRequest {
	return page
		.waitForRequest(
			(candidate) => /\/wcpos\/v2\/registers$/.test(wirePath(new URL(candidate.url()))),
			{
				timeout: 120_000,
			}
		)
		.then(
			(value) => ({ value }),
			(error: unknown) => ({ error })
		);
}

/** Pick a free register of the store the app reads, on the register picker the app shows. */
export async function pickFreeRegister(
	page: Page,
	request: APIRequestContext,
	info: TestInfo,
	storeAuthorization: () => StoreAuthorization | null,
	registersRequest: RegistersRequest
): Promise<void> {
	const seen = await registersRequest;
	if ('error' in seen) throw seen.error;
	const storeId = new URL(seen.value.url()).searchParams.get('store_id') || null;
	const id = await freeRegisterId(request, info, storeAuthorization, storeId);
	if ((await posLayout(page)) === 'phone') await showPhoneTab(page, 'cart');
	const row = page.getByTestId(`register-picker-row-${id}`);
	await expect(row).toBeVisible({ timeout: 60_000 });
	await row.click();
	await expect(row).toBeHidden({ timeout: 60_000 });
	console.log(`[register] ${info.titlePath.at(-2)}: picked ${id}`);
}
