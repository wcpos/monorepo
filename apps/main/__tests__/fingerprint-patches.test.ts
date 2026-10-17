const { isNativePatch } = require('../fingerprint-patches');

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
});
