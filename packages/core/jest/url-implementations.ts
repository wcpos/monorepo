/**
 * Cover web and native: Expo SDK 58 installs the whatwg-url-minimum URL as
 * the global URL on iOS and Android (expo/src/winter/runtime.native.ts).
 */
import * as path from 'path';

const nativeUrl = require(
	require.resolve('whatwg-url-minimum', {
		paths: [path.dirname(require.resolve('expo/package.json'))],
	})
) as { URL: typeof URL };

export const URL_IMPLEMENTATIONS: readonly [label: string, impl: typeof URL][] = [
	['web: WHATWG URL (Node)', globalThis.URL],
	['native: expo winter URL (whatwg-url-minimum)', nativeUrl.URL],
];

export function withGlobalUrl(impl: typeof URL): void {
	let original: typeof URL;
	beforeAll(() => {
		original = globalThis.URL;
		globalThis.URL = impl;
	});
	afterAll(() => {
		globalThis.URL = original;
	});
}
