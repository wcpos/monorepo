/**
 * URL scheme of the INSTALLED native binary, keyed by application id.
 *
 * Each EAS build profile registers its own scheme (apps/main/app.config.ts):
 * the store build owns `wcpos`, the development client `wcpos-dev`, ad-hoc
 * builds `wcpos-adhoc`. The login redirect must use the scheme the running
 * binary actually registered, and the Expo manifest is NOT a reliable source
 * for it: a dev client loads its manifest from Metro, which evaluates
 * app.config.ts with whatever EAS_BUILD_PROFILE the developer's shell has
 * (usually none, so it publishes the production `wcpos`). The application id
 * comes from the binary itself, so it is the only value that cannot disagree
 * with the intent filters / CFBundleURLSchemes compiled into it.
 *
 * Keep in step with the `scheme` / `bundleIdentifier` / `package` triples in
 * apps/main/app.config.ts.
 */
const SCHEME_BY_APPLICATION_ID: Readonly<Record<string, string>> = {
	'com.wcpos.main': 'wcpos',
	'com.wcpos.main.dev': 'wcpos-dev',
	'com.wcpos.main.adhoc': 'wcpos-adhoc',
};

/** The store build's scheme; also what web and Electron report. */
export const DEFAULT_APP_SCHEME = 'wcpos';

/**
 * Resolve the URL scheme for a native application id (iOS bundle identifier
 * or Android package). Unknown or missing ids fall back to the store scheme so
 * a renamed variant fails towards the production app rather than a dead link.
 */
export function schemeForApplicationId(applicationId: string | null | undefined): string {
	if (!applicationId) return DEFAULT_APP_SCHEME;
	return SCHEME_BY_APPLICATION_ID[applicationId] ?? DEFAULT_APP_SCHEME;
}
