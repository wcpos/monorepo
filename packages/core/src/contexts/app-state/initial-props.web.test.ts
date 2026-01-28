/**
 * @jest-environment jsdom
 */

describe('initial-props.web', () => {
	const originalGlobalThis = { ...globalThis };

	beforeEach(() => {
		// Reset globalThis.initialProps before each test
		delete (globalThis as any).initialProps;
		// Clear the module cache to re-evaluate the module
		jest.resetModules();
	});

	afterAll(() => {
		// Restore original globalThis
		Object.assign(globalThis, originalGlobalThis);
	});

	describe('getInitialProps', () => {
		it('should return null when globalThis.initialProps is undefined', async () => {
			const { initialProps } = await import('./initial-props.web');
			expect(initialProps).toBeNull();
		});

		it('should return null when globalThis.initialProps is an empty object', async () => {
			(globalThis as any).initialProps = {};
			const { initialProps } = await import('./initial-props.web');
			expect(initialProps).toBeNull();
		});

		it('should return null when globalThis.initialProps has no site', async () => {
			(globalThis as any).initialProps = {
				wp_credentials: { uuid: 'cred-123' },
				stores: [],
			};
			const { initialProps } = await import('./initial-props.web');
			expect(initialProps).toBeNull();
		});

		it('should return null when globalThis.initialProps has no wp_credentials', async () => {
			(globalThis as any).initialProps = {
				site: { uuid: 'site-123' },
				stores: [],
			};
			const { initialProps } = await import('./initial-props.web');
			expect(initialProps).toBeNull();
		});

		it('should return frozen initialProps when valid WordPress props exist', async () => {
			const validProps = {
				site: { uuid: 'site-123', name: 'Test Site' },
				wp_credentials: { uuid: 'cred-123', access_token: 'token' },
				stores: [{ id: 1, name: 'Store 1' }],
				logout_url: 'https://example.com/logout',
			};
			(globalThis as any).initialProps = validProps;

			const { initialProps } = await import('./initial-props.web');

			expect(initialProps).not.toBeNull();
			expect(initialProps?.site).toEqual(validProps.site);
			expect(initialProps?.wp_credentials).toEqual(validProps.wp_credentials);
			expect(initialProps?.stores).toEqual(validProps.stores);
			expect(initialProps?.logout_url).toBe(validProps.logout_url);
		});

		it('should freeze the returned initialProps object', async () => {
			(globalThis as any).initialProps = {
				site: { uuid: 'site-123' },
				wp_credentials: { uuid: 'cred-123' },
				stores: [],
			};

			const { initialProps } = await import('./initial-props.web');

			expect(initialProps).not.toBeNull();
			expect(Object.isFrozen(initialProps)).toBe(true);
		});
	});
});
