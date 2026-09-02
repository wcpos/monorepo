// @ts-expect-error: semver lacks type declarations in this project
import semver from 'semver';

/**
 * Oldest WCPOS plugin release this app can talk to.
 *
 * The `wcpos/v2` REST namespace requirement begins at 1.10.0. The search
 * contract this client relies on is younger: since 1.10.3 the v2 product
 * search matches SKU and the configured barcode meta key through `search=`,
 * and since 1.10.8 an exact SKU/barcode match is ranked first on the page
 * (wcpos/woocommerce-pos#1834). This client sends one `search=` request per
 * collection and no separate exact `sku=` request, so it needs both — on an
 * older store an exact dictionary-word SKU (`red`) could fall off a first page
 * filled by newer title matches.
 * Connect-time discovery checks the namespace directly (it is the ground truth);
 * this constant names the version to tell the merchant to update to, and the
 * saved-site rows hide login for a store reporting anything older.
 *
 * This lives in a leaf module on purpose: the connect screen needs the number
 * before any app state exists, and importing it from `use-app-info` would pull
 * the whole app-state context in with it.
 */
export const MINIMUM_WCPOS_PLUGIN_VERSION = '1.10.8';

export function isWcposPluginCompatible(pluginVersion: string | undefined): boolean {
	if (!pluginVersion) return false;

	try {
		const coerced = semver.coerce(pluginVersion);
		return !!coerced && semver.gte(coerced, MINIMUM_WCPOS_PLUGIN_VERSION);
	} catch {
		return false;
	}
}
