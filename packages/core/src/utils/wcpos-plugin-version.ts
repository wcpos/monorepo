// @ts-expect-error: semver lacks type declarations in this project
import semver from 'semver';

/**
 * Oldest WCPOS plugin release this app can talk to.
 *
 * Requires the 1.11.0 wire contract: bare variation records with
 * `_rxdb_revision`, a bare `/resolve/barcode` match, and a unified
 * `/orders/pull` checkpoint. The `wcpos/v2` namespace alone is insufficient.
 *
 * This lives in a leaf module on purpose: the connect screen needs the number
 * before any app state exists, and importing it from `use-app-info` would pull
 * the whole app-state context in with it.
 */
export const MINIMUM_WCPOS_PLUGIN_VERSION = '1.11.0';

export function isWcposPluginCompatible(pluginVersion: string | undefined): boolean {
	if (!pluginVersion) return false;

	try {
		const coerced = semver.coerce(pluginVersion);
		return !!coerced && semver.gte(coerced, MINIMUM_WCPOS_PLUGIN_VERSION);
	} catch {
		return false;
	}
}
