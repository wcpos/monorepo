// @ts-expect-error: semver lacks type declarations in this project
import semver from 'semver';

/**
 * Oldest WCPOS plugin release this app can talk to.
 *
 * The real requirement is the `wcpos/v2` REST namespace — every store route the
 * app calls lives there. 1.10.0 is the first plugin release that registers it,
 * so a 1.9.x store exposes only `wcpos/v1` and cannot serve this client.
 * Connect-time discovery checks the namespace directly (it is the ground truth);
 * this constant names the version to tell the merchant to update to.
 *
 * This lives in a leaf module on purpose: the connect screen needs the number
 * before any app state exists, and importing it from `use-app-info` would pull
 * the whole app-state context in with it.
 */
export const MINIMUM_WCPOS_PLUGIN_VERSION = '1.10.0';

export function isWcposPluginCompatible(pluginVersion: string | undefined): boolean {
	if (!pluginVersion) return false;

	try {
		const coerced = semver.coerce(pluginVersion);
		return !!coerced && semver.gte(coerced, MINIMUM_WCPOS_PLUGIN_VERSION);
	} catch {
		return false;
	}
}
