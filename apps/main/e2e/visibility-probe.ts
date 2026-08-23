import { type StoreAuthorization, storeRequestOptions } from './fixtures';

import type { APIRequestContext } from '@playwright/test';

/**
 * Drive the plugin's POS-visibility settings from a spec, so a live test can make a
 * product online-only (hidden from the POS) and put it back.
 *
 * # Why this is a settings write and not a product write
 *
 * Visibility is NOT per-record postmeta. `Sync\Pos_Visibility` — the sole authority
 * for what the POS may be served — reads ONE wp_option holding ID LISTS per scope:
 *
 *   woocommerce_pos_settings_visibility = array(
 *     'products' => array( '<scope>' => array(
 *       'pos_only'    => array( 'ids' => array( … ) ),  // hidden from the WEB store
 *       'online_only' => array( 'ids' => array( … ) ),  // hidden from the POS — ours
 *     ) ),
 *     'variations' => array( … ),
 *   )
 *
 * So hiding a probe means editing a shared list, never touching the product. That
 * has two consequences this module exists to contain.
 *
 * # Consequence 1: the option is shared, so every write is a narrow PATCH
 *
 * One option serves every shard and every concurrent CI run against the same dev
 * store, and there is no cross-run mutex by ruling. Posting the whole structure
 * would rewrite lists this spec has no business touching. The server already does
 * `write( merge( read(), payload ) )` with `array_replace_recursive`, so each write
 * here sends only the one leaf it changes and computes that leaf's value as the
 * union of what is stored plus (or minus) this run's probe id. Two runs can still
 * interleave a read-modify-write on the SAME leaf and lose one id; that costs the
 * losing run a failed assertion, never a corrupted store, and it cannot strand a
 * foreign product in the hidden list.
 *
 * # Consequence 2: the feature gate is global, and left ON deliberately
 *
 * `Pos_Visibility` reports an empty hidden set unless the `pos_only_products` toggle
 * in the General section is on, so a spec that hides an id without the gate proves
 * nothing. This module turns the gate on and NEVER turns it off — because with an
 * empty `online_only` list the two states are behaviourally identical, so leaving it
 * on changes nothing any other spec can observe, while turning it off could blind a
 * concurrent run's hidden probe. Teardown removes the id; the gate stays.
 */

/** The plugin's General-section key for the POS-only/online-only feature gate. */
const POS_ONLY_PRODUCTS_KEY = 'pos_only_products';
/** Visibility scope for a single-store site; a store id would replace it per-store. */
const DEFAULT_SCOPE = 'default';

type VisibilitySection = 'products' | 'variations';
type SettingsSection = 'general' | 'visibility';

type IdList = { ids?: unknown };
type ScopeEntry = { pos_only?: IdList; online_only?: IdList };
type VisibilitySettings = Partial<Record<VisibilitySection, Record<string, ScopeEntry>>>;

/**
 * `wcpos/v1` settings, addressed through BOTH permalink spellings.
 *
 * Mirrors `probeRequest` in search-probe.ts rather than reusing it: that helper is
 * hard-wired to `wc/v3/<collection>` and these routes are the plugin's own
 * namespace. The pretty-then-plain retry is the same store-agnostic requirement —
 * a store on plain permalinks serves `/wp-json/…` as a 404.
 */
async function settingsRequest(
	request: APIRequestContext,
	method: 'get' | 'post',
	storeUrl: string,
	section: SettingsSection,
	authorization: StoreAuthorization | null,
	data?: Record<string, unknown>
) {
	const base = storeUrl.replace(/\/+$/, '');
	const route = `/wcpos/v1/settings/${section}`;
	const options = {
		...storeRequestOptions(authorization),
		...(data === undefined ? {} : { data }),
	};
	const pretty = await request[method](`${base}/wp-json${route}`, options);
	if (pretty.status() !== 404) return pretty;
	return request[method](`${base}/index.php`, {
		...options,
		params: { ...options.params, rest_route: route },
	});
}

async function readSection(
	request: APIRequestContext,
	storeUrl: string,
	section: SettingsSection,
	authorization: StoreAuthorization | null
): Promise<Record<string, unknown>> {
	const response = await settingsRequest(request, 'get', storeUrl, section, authorization);
	if (!response.ok()) {
		throw new Error(
			`Could not read the ${section} settings section (HTTP ${response.status()}); ` +
				'the product-writer identity needs manage_woocommerce_pos'
		);
	}
	const body: unknown = await response.json().catch(() => null);
	return body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

/** Positive integer ids from a stored list, dropping anything malformed. */
function idsOf(entry: ScopeEntry | undefined, key: 'pos_only' | 'online_only'): number[] {
	const raw = entry?.[key]?.ids;
	if (!Array.isArray(raw)) return [];
	return raw
		.map((value) => Number(value))
		.filter((value) => Number.isSafeInteger(value) && value > 0);
}

/**
 * Read this section+scope's online-only ids, apply `mutate`, and PATCH just that
 * list back.
 *
 * The payload is deliberately the narrowest branch that expresses the change —
 * `{ products: { default: { online_only: { ids } } } }` — because the server does
 * its own `write( merge( read(), payload ) )` (Settings::update_section_settings),
 * and Visibility_Section::merge walks the patch, `array_replace`-ing only the leaves
 * it names. So `variations` and `pos_only` are never written at all, and a
 * concurrent run editing those cannot be clobbered by this one.
 *
 * The read is still required: `array_replace` swaps the whole `ids` array, so the
 * union has to be computed here. That read-modify-write can still interleave with
 * another run's, which costs the loser an assertion — never a corrupted store, and
 * never a foreign id stranded in the list.
 */
async function rewriteOnlineOnlyIds(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization | null,
	section: VisibilitySection,
	mutate: (current: number[]) => number[]
): Promise<void> {
	const current = (await readSection(
		request,
		storeUrl,
		'visibility',
		authorization
	)) as VisibilitySettings;
	const next = mutate(idsOf(current[section]?.[DEFAULT_SCOPE], 'online_only'));
	const response = await settingsRequest(request, 'post', storeUrl, 'visibility', authorization, {
		[section]: { [DEFAULT_SCOPE]: { online_only: { ids: next } } },
	});
	if (!response.ok()) {
		throw new Error(`Could not write the visibility settings (HTTP ${response.status()})`);
	}
}

/**
 * Turn the POS-only/online-only feature gate on if it is off, and report whether the
 * store had it on already.
 *
 * Never turns it off again — see the module docblock. Reads first and returns early
 * when it is already on (dev-free is, as of 2026-08-23), so the common path writes
 * NOTHING to the shared General section; and the write, when one is needed, patches
 * the single key rather than echoing every other general setting back.
 */
export async function ensurePosOnlyProductsEnabled(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization | null
): Promise<{ alreadyEnabled: boolean }> {
	const general = await readSection(request, storeUrl, 'general', authorization);
	if (general[POS_ONLY_PRODUCTS_KEY] === true) return { alreadyEnabled: true };
	const response = await settingsRequest(request, 'post', storeUrl, 'general', authorization, {
		[POS_ONLY_PRODUCTS_KEY]: true,
	});
	if (!response.ok()) {
		throw new Error(
			`Could not enable ${POS_ONLY_PRODUCTS_KEY} (HTTP ${response.status()}); ` +
				'the POS-visibility rule is inert while it is off'
		);
	}
	return { alreadyEnabled: false };
}

/** Hide one product from the POS by adding it to the online-only list. */
export async function hideProductFromPos(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization | null,
	productId: number
): Promise<void> {
	await rewriteOnlineOnlyIds(request, storeUrl, authorization, 'products', (ids) =>
		ids.includes(productId) ? ids : [...ids, productId]
	);
}

/**
 * Put one product back in the POS's servable set.
 *
 * Safe to call when the id was never added (teardown runs on the failure path too),
 * and it removes ONLY this id, so a concurrent run's hidden probe survives.
 */
export async function revealProductToPos(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization | null,
	productId: number
): Promise<void> {
	await rewriteOnlineOnlyIds(request, storeUrl, authorization, 'products', (ids) =>
		ids.filter((id) => id !== productId)
	);
}

/** Whether the store currently hides this product from the POS — the server's own answer. */
export async function isProductHiddenFromPos(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization | null,
	productId: number
): Promise<boolean> {
	const current = (await readSection(
		request,
		storeUrl,
		'visibility',
		authorization
	)) as VisibilitySettings;
	return idsOf(current.products?.[DEFAULT_SCOPE], 'online_only').includes(productId);
}
