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
