const rawStorage = { name: 'expo-filesystem-storage' };
const errorHandledStorage = { name: 'error-handled-storage' };
const validatedStorage = { name: 'validated-storage' };
const mockWrappedErrorHandlerStorage = jest.fn((_options: unknown) => errorHandledStorage);
const mockWrappedValidateZSchemaStorage = jest.fn((_options: unknown) => validatedStorage);

jest.mock('../storage', () => ({
	getNativeNewStorage: () => rawStorage,
}));

jest.mock('../../plugins/wrapped-error-handler-storage', () => ({
	wrappedErrorHandlerStorage: (options: unknown) => mockWrappedErrorHandlerStorage(options),
}));

jest.mock('rxdb/plugins/validate-z-schema', () => ({
	wrappedValidateZSchemaStorage: (options: unknown) => mockWrappedValidateZSchemaStorage(options),
}));

it('wraps native storage with the error handler before dev validation', async () => {
	const { defaultConfig, storage } = await import('./index');

	expect(mockWrappedErrorHandlerStorage).toHaveBeenCalledWith({ storage: rawStorage });
	expect(mockWrappedValidateZSchemaStorage).toHaveBeenCalledWith({
		storage: errorHandledStorage,
	});
	expect(storage).toBe(errorHandledStorage);
	expect(defaultConfig).toEqual({
		storage: validatedStorage,
		multiInstance: false,
		ignoreDuplicate: true,
	});
});
