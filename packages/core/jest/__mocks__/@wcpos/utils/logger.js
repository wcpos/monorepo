/* global jest */
/**
 * Mock for @wcpos/utils/logger
 *
 * This mock provides all the exports from the real logger module
 * but with jest mock functions for testing.
 */

const mockLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	success: jest.fn(),
	getChild: jest.fn(function () {
		return mockLogger;
	}),
	with: jest.fn(function () {
		return mockLogger;
	}),
	getCategoryString: jest.fn(() => 'test.category'),
};

// CategoryLogger class mock
class CategoryLogger {
	constructor(category, boundContext = {}) {
		this.category = category;
		this.boundContext = boundContext;
	}

	getChild(subcategory) {
		return mockLogger;
	}

	with(context) {
		return mockLogger;
	}

	getCategoryString() {
		return this.category.join('.');
	}

	debug = jest.fn();
	info = jest.fn();
	warn = jest.fn();
	error = jest.fn();
	success = jest.fn();
}

// Factory function that returns a mock logger
const getLogger = jest.fn((category) => {
	return mockLogger;
});

// Default export (the base logger)
module.exports = mockLogger;
module.exports.default = mockLogger;

// Named exports
module.exports.getLogger = getLogger;
module.exports.CategoryLogger = CategoryLogger;
module.exports.getErrorMessage = (error) =>
	error instanceof Error ? error.message : String(error);
module.exports.setToast = jest.fn();
module.exports.setDatabase = jest.fn();
module.exports.log = mockLogger;

// Verbose-diagnostics flag (stateful so toggle round-trips in component tests)
let mockVerboseDiagnostics = false;
module.exports.isVerboseDiagnostics = jest.fn(() => mockVerboseDiagnostics);
module.exports.setVerboseDiagnostics = jest.fn((enabled) => {
	mockVerboseDiagnostics = !!enabled;
});

// Flight recorder surface
module.exports.recorderStats = jest.fn(() => ({ events: 0, bytes: 0 }));
module.exports.snapshotRecorder = jest.fn(() => []);
module.exports.promoteRecorder = jest.fn();
