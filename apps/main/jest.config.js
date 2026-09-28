const path = require('node:path');

const expoPreset = require('jest-expo/jest-preset');

// jest-expo transforms `@sentry/react-native` itself, but its dependencies
// (`@sentry/core`, `@sentry/react`, `@sentry-internal/*`) publish a
// `react-native` export condition that resolves to their ESM build, which Jest
// cannot parse untransformed ("Unexpected token 'export'"). Widen the preset's
// own allowlist entry to the whole scope rather than replacing the list, so a
// jest-expo upgrade that adds packages keeps working.
const transformIgnorePatterns = expoPreset.transformIgnorePatterns.map((pattern) =>
	pattern.replace('@sentry/react-native', '@sentry')
);
if (transformIgnorePatterns.join('\n') === expoPreset.transformIgnorePatterns.join('\n')) {
	throw new Error(
		'jest-expo no longer allowlists @sentry/react-native; update the @sentry transform rule in apps/main/jest.config.js'
	);
}

// jest-expo 58 maps `react-native/asset-registry` to `react-native/src/asset-registry`, a
// subpath React Native 0.88's package exports do not expose, and @react-native/jest-preset
// 0.88's resolver enforces exports — so every suite fails at setup with "Could not locate
// module react-native/asset-registry". Map it to the file itself (a path, not a specifier,
// bypasses exports). Drop when jest-expo maps to an exported entry.
const reactNativeDir = path.dirname(require.resolve('react-native/package.json'));

module.exports = {
	preset: 'jest-expo',
	// After the preset's own setup (which loads Expo's winter runtime): see the file's header.
	setupFiles: [...expoPreset.setupFiles, '<rootDir>/jest/resolve-winter-globals.js'],
	moduleNameMapper: {
		'^react-native/asset-registry$': path.join(reactNativeDir, 'src/asset-registry.js'),
		'^@wcpos/order-math$': '<rootDir>/../../packages/order-math/src',
	},
	testPathIgnorePatterns: [
		'/node_modules/',
		'<rootDir>/e2e/',
		'<rootDir>/gallery/',
		'<rootDir>/plugins/',
		'<rootDir>/metro/',
	],
	transformIgnorePatterns,
};
