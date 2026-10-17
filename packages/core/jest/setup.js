/**
 * Jest setup file for @wcpos/core tests
 *
 * This file is run before each test file and provides global setup.
 * Logger mocks are handled via moduleNameMapper in jest.config.js.
 */

// Define __DEV__ globally if not already defined
if (typeof global.__DEV__ === 'undefined') {
	global.__DEV__ = true;
}

// jsdom has no matchMedia. Shared rows and nav items read the pointer through it
// (`usePointer` in @wcpos/components/lib/device), so every screen that renders one
// would throw. No media query matches here: a coarse pointer, as on a tablet. A test
// that needs the fine pointer mocks `@wcpos/components/lib/device` as before.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
	window.matchMedia = (query) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	});
}
