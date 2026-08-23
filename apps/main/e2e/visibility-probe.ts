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
 * union of what is stored plus (or minus) this run's probe id.
 *
 * That is a narrowing, NOT a guarantee. Two runs can still interleave a
 * read-modify-write on the same leaf, and the later write can drop the earlier run's
 * change — including re-adding an id another run had just removed. Nothing available
 * here makes the write atomic and there is no cross-run mutex by ruling, so every
 * write is followed by a re-read that confirms the intended membership and repeats
 * once (`rewriteAndConfirm`). A residual interleaving therefore surfaces as a named
 * error rather than as a mystery visibility assertion failure.
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
	// A successful response whose body is not an object must NOT degrade to `{}`.
	// Every caller derives the NEW value of a shared id list from this read, so an
	// empty default silently rewrites that list to contain only this run's probe —
	// or, in teardown, to nothing at all — wiping every pre-existing visibility rule
	// on the store. Unparseable is a hard failure, not an empty store.
	const body: unknown = await response.json().catch(() => undefined);
	if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) {
		throw new Error(
			`The ${section} settings section returned HTTP ${response.status()} with a body that is not a settings object; refusing to rewrite shared settings from it`
		);
	}
	return body as Record<string, unknown>;
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
): Promise<number[]> {
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
	return next;
}

/**
 * Read-modify-write the online-only list, then CONFIRM the intended membership
 * actually landed, retrying once.
 *
 * `array_replace` swaps the whole `ids` leaf, so two concurrent runs can interleave
 * read-modify-write on that one leaf and the later write drops the earlier run's
 * change. This does not make the write atomic — nothing available here can, and
 * there is no cross-run mutex by ruling — but re-reading and repeating once collapses
 * the common interleaving, and a still-wrong membership is raised instead of being
 * left for a downstream assertion to misreport as a visibility failure.
 */
async function rewriteAndConfirm(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization | null,
	section: VisibilitySection,
	productId: number,
	shouldContain: boolean
): Promise<void> {
	const mutate = (ids: number[]) =>
		shouldContain
			? ids.includes(productId)
				? ids
				: [...ids, productId]
			: ids.filter((id) => id !== productId);
	for (let attempt = 0; attempt < 2; attempt += 1) {
		await rewriteOnlineOnlyIds(request, storeUrl, authorization, section, mutate);
		const settled = (await readSection(
			request,
			storeUrl,
			'visibility',
			authorization
		)) as VisibilitySettings;
		if (
			idsOf(settled[section]?.[DEFAULT_SCOPE], 'online_only').includes(productId) === shouldContain
		)
			return;
	}
	throw new Error(
		`Visibility write did not stick for product ${productId} (wanted ${shouldContain ? 'hidden' : 'visible'}); a concurrent run is rewriting the same list`
	);
}

/**
 * Make sure the POS-only/online-only feature gate is on, WITHOUT ever activating
 * rules the store already has saved.
 *
 * `Pos_Visibility` reports an empty hidden set while the gate is off, so a spec that
 * hides an id without it proves nothing. But flipping the gate on is only harmless
 * when the saved lists are EMPTY — if a store has the gate off yet still carries
 * `online_only` / `pos_only` ids from earlier configuration, enabling it would hide
 * all of those products from every POS client at once, and this helper deliberately
 * never restores the previous gate state. That is a store-wide behaviour change no
 * test may make.
 *
 * So: gate already on -> nothing to do. Gate off with empty lists -> enable it and
 * leave it on (indistinguishable states, and turning it back off could blind a
 * concurrent run's hidden probe). Gate off with saved rules -> refuse, and let the
 * caller skip with a reason naming exactly what is in the way.
 */
export type GateDecision = { ok: true; alreadyEnabled: boolean } | { ok: false; reason: string };

export async function ensurePosOnlyProductsEnabled(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization | null
): Promise<GateDecision> {
	const general = await readSection(request, storeUrl, 'general', authorization);
	if (general[POS_ONLY_PRODUCTS_KEY] === true) return { ok: true, alreadyEnabled: true };

	const visibility = (await readSection(
		request,
		storeUrl,
		'visibility',
		authorization
	)) as VisibilitySettings;
	const saved = (['products', 'variations'] as const).flatMap((section) => {
		const scope = visibility[section]?.[DEFAULT_SCOPE];
		return [...idsOf(scope, 'online_only'), ...idsOf(scope, 'pos_only')];
	});
	if (saved.length > 0) {
		return {
			ok: false,
			reason: `pos_only_products is off but the store has ${saved.length} saved visibility id(s); enabling the gate would hide them from every POS client`,
		};
	}

	const response = await settingsRequest(request, 'post', storeUrl, 'general', authorization, {
		[POS_ONLY_PRODUCTS_KEY]: true,
	});
	if (!response.ok()) {
		throw new Error(
			`Could not enable ${POS_ONLY_PRODUCTS_KEY} (HTTP ${response.status()}); ` +
				'the POS-visibility rule is inert while it is off'
		);
	}
	return { ok: true, alreadyEnabled: false };
}

/** Hide one product from the POS by adding it to the online-only list. */
export async function hideProductFromPos(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization | null,
	productId: number
): Promise<void> {
	await rewriteAndConfirm(request, storeUrl, authorization, 'products', productId, true);
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
	await rewriteAndConfirm(request, storeUrl, authorization, 'products', productId, false);
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
