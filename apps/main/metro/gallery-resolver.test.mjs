import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const main = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = path.join(main, 'components/gallery/registry.tsx');
const stub = path.join(main, 'components/gallery/registry.stub.tsx');

// Exercise the actual configured resolver, without booting Sentry/Uniwind/Metro.
function resolver(flag) {
	const require = Object.assign(
		(name) => {
			if (name === 'path') return path;
			if (name === 'dotenv') return { config() {} };
			if (name === '@sentry/react-native/metro')
				return { getSentryExpoConfig: () => ({ resolver: { assetExts: [] } }) };
			if (name === 'metro-cache') return { FileStore: class {} };
			if (name === 'uniwind/metro') return { withUniwindConfig: (config) => config };
			if (name === './metro/bundle-serializer-cache')
				return { withBundleSerializerCache: (config) => config };
			throw new Error(`Unexpected require: ${name}`);
		},
		{ resolve: (name) => `/node_modules/${name}` }
	);
	const sandbox = { require, __dirname: main, module: { exports: {} }, process: { env: {} } };
	if (flag !== undefined) sandbox.process.env.EXPO_PUBLIC_WCPOS_GALLERY = flag;
	vm.runInNewContext(readFileSync(path.join(main, 'metro.config.js'), 'utf8'), sandbox);
	return sandbox.module.exports.resolver.resolveRequest;
}

for (const [flag, platform, expected] of [
	[undefined, 'web', stub],
	['0', 'web', stub],
	['1', 'web', registry],
	['1', 'ios', stub],
]) {
	test(`gallery registry flag=${flag} platform=${platform} resolves to ${path.basename(expected)}`, () => {
		const resolve = resolver(flag);
		const context = {
			originModulePath: path.join(main, 'app/(gallery)/gallery/index.tsx'),
			resolveRequest: (_context, name) => ({ type: 'sourceFile', filePath: `${name}.tsx` }),
		};
		const result = resolve(context, '@wcpos/main/components/gallery/registry', platform);
		assert.equal(result.filePath, expected);
		assert.equal(result.type, 'sourceFile');
	});
}
