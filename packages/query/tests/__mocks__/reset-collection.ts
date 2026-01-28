/**
 * Mock for @wcpos/database/plugins/reset-collection
 * Used during collection swap operations to control reset$ emissions
 */

/**
 * Track collections being swapped to suppress automatic reset$ emissions
 */
export const swappingCollections = new Set<string>();

/**
 * Manually emit a reset event for a collection
 */
export const emitCollectionReset = jest.fn((collection: any, databaseName: string) => {
	// In tests, this is a no-op unless specifically mocked
});
