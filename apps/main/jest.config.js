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

module.exports = {
	preset: 'jest-expo',
	moduleNameMapper: {
		'^@wcpos/order-math$': '<rootDir>/../../packages/order-math/src',
	},
	testPathIgnorePatterns: [
		'/node_modules/',
		'<rootDir>/e2e/',
		'<rootDir>/plugins/',
		'<rootDir>/metro/',
	],
	transformIgnorePatterns,
};
