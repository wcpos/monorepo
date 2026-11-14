const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { isNativePatch, nativePatchFiles } = require('../fingerprint-patches');

describe('fingerprint patch classification', () => {
	it.each<[string, boolean]>([
		['android/src/main/java/Foo.kt', true],
		['ios/Foo.swift', true],
		['ios/generated/Spec.h', true],
		['build.gradle.kts', true],
		['cpp/CMakeLists.txt', true],
		['cpp/foo.cc', true],
		['apple/Foo.xcconfig', true],
		['app.plugin.js', true],
		['plugin/build/withFoo.js', true],
		['expo-module.config.json', true],
		['react-native.config.js', true],
		['src/NativeEscPosPrinter.ts', true],
		['src/specs/FooNativeComponent.ts', true],
		['src/NativeFoo.ios.ts', true],
		['src/specs/FooNativeComponent.android.ts', true],
		['src/Native_foo.ts', true],
		['package.json', true],
		['', true],
		['build/src/start/server/middleware/ManifestMiddleware.js', false],
		['dist/index.d.ts', false],
		['lib/module/views/Drawer.native.js', false],
		['src/Platform/Platform.web.tsx', false],
		['types/react-native-web.d.ts', false],
	])('classifies %s as native: %s', (path, native) => {
		const patch = path ? `diff --git a/${path} b/${path}\n` : '';
		expect(isNativePatch(patch)).toBe(native);
	});

	it('classifies a patch touching both JS and iOS as native', () => {
		const patch =
			'diff --git a/src/index.js b/src/index.js\n' + 'diff --git a/ios/Foo.swift b/ios/Foo.swift\n';
		expect(isNativePatch(patch)).toBe(true);
	});

	it('classifies a spaced header after a parseable JS header as native', () => {
		const patch =
			'diff --git a/src/index.js b/src/index.js\n' +
			'diff --git a/ios/My File.swift b/ios/My File.swift\n';
		expect(isNativePatch(patch)).toBe(true);
	});

	it('classifies a quoted header as native', () => {
		const patch = 'diff --git "a/ios/caf\\303\\251.swift" "b/ios/caf\\303\\251.swift"\n';
		expect(isNativePatch(patch)).toBe(true);
	});

	it('classifies a rename from JS to iOS as native', () => {
		expect(isNativePatch('diff --git a/src/a.js b/ios/a.swift\n')).toBe(true);
	});

	it('hashes unlisted patches and listed patches that touch native paths', () => {
		const patchesDir = mkdtempSync(join(tmpdir(), 'fp-patches-'));
		try {
			writeFileSync(join(patchesDir, 'listed@1.0.0.patch'), 'diff --git a/src/a.js b/src/a.js\n');
			writeFileSync(join(patchesDir, 'unlisted@1.0.0.patch'), 'diff --git a/src/a.js b/src/a.js\n');
			writeFileSync(
				join(patchesDir, 'listed-native@1.0.0.patch'),
				'diff --git a/ios/a.swift b/ios/a.swift\n'
			);
			expect(
				nativePatchFiles(patchesDir, {
					'listed@1.0.0.patch': 'x',
					'listed-native@1.0.0.patch': 'x',
				})
			).toEqual(['listed-native@1.0.0.patch', 'unlisted@1.0.0.patch']);
		} finally {
			rmSync(patchesDir, { recursive: true, force: true });
		}
	});
});
