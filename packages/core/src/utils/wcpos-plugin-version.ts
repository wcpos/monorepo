// @ts-expect-error: semver lacks type declarations in this project
import semver from 'semver';

/**
 * Oldest WCPOS plugin release this app can talk to.
 *
 * The `wcpos/v2` REST namespace requirement still begins at 1.10.0. Version
 * 1.10.3 is the first release whose v2 product search matches SKU and the
 * configured barcode meta key through `search=`; this client no longer sends
 * a separate `sku=` request.
 * Connect-time discovery checks the namespace directly (it is the ground truth);
 * this constant names the version to tell the merchant to update to.
 *
 * This lives in a leaf module on purpose: the connect screen needs the number
 * before any app state exists, and importing it from `use-app-info` would pull
 * the whole app-state context in with it.
 */
export const MINIMUM_WCPOS_PLUGIN_VERSION = '1.10.3';

export function isWcposPluginCompatible(pluginVersion: string | undefined): boolean {
	if (!pluginVersion) return false;

	try {
		const coerced = semver.coerce(pluginVersion);
		return !!coerced && semver.gte(coerced, MINIMUM_WCPOS_PLUGIN_VERSION);
	} catch {
		return false;
	}
}
