/* global jest */
// Expo 58's winter runtime (expo/src/winter/runtime.native.ts, loaded by jest-expo's setup)
// installs several globals LAZILY: each is a Proxy whose first property read runs a
// `require()` for the implementation. Two things turn that into a suite-level failure:
//  1. a first read after the suite's last test has settled (a timer, a disposal path) makes
//     jest-runtime throw "You are trying to `require` a file outside of the scope of the
//     test code";
//  2. a suite that calls `jest.resetModules()` re-executes the runtime on the next `expo`
//     import, which re-installs the lazy Proxies over the already-resolved globals, so (1)
//     can recur after every reset (seen on lib/create-app-engine.test.ts).
// Resolve every lazy global now, inside the setup phase, and pin the executed runtime module
// so a post-reset import reuses it instead of re-installing. The list mirrors the
// `install(...)` calls in runtime.native.ts; an unknown name is harmless.
const winterRuntime = jest.requireActual('expo/src/winter/runtime.native');

for (const name of [
	'TextDecoder',
	'TextDecoderStream',
	'TextEncoderStream',
	'URL',
	'URLSearchParams',
	'DOMException',
	'__ExpoImportMetaRegistry',
	'structuredClone',
	'fetch',
]) {
	const value = globalThis[name];
	if (value !== undefined && value !== null) void value.name;
}

jest.doMock('expo/src/winter/runtime.native', () => winterRuntime);
