import * as Sentry from '@sentry/browser';

jest.mock('@sentry/browser');
jest.mock('../app-info', () => ({ AppInfo: { version: '1.0.0', platform: 'web' } }));

const localStorageData = new Map<string, string>();
const localStorage = {
	getItem: jest.fn((key: string) => localStorageData.get(key) ?? null),
	setItem: jest.fn((key: string, value: string) => localStorageData.set(key, value)),
	removeItem: jest.fn((key: string) => localStorageData.delete(key)),
};
// The sink refuses to initialise in development builds; this suite exercises
// the production path. Cleared before the module under test is loaded.
const testGlobal = globalThis as typeof globalThis & { __DEV__: boolean };
testGlobal.__DEV__ = false;
Object.defineProperty(globalThis, 'window', {
	configurable: true,
	value: {
		localStorage,
		crypto: { randomUUID: () => 'new-install-id' },
	},
});

const {
	buildCaptureOptions,
	captureLoggedError,
	messageTemplate,
	scrubEvent,
	setTelemetryConsent,
} = jest.requireActual<typeof import('./sentry-sink.web')>('./sentry-sink.web');
const sentryInitCallsOnImport = jest.mocked(Sentry.init).mock.calls.length;

describe('sentry-sink.web', () => {
	beforeEach(() => {
		setTelemetryConsent('undecided');
		localStorageData.clear();
		jest.clearAllMocks();
	});

	it('does not initialize Sentry at module load', () => {
		expect(sentryInitCallsOnImport).toBe(0);
	});

	it('initializes Sentry once when tracking is allowed', () => {
		setTelemetryConsent('allowed');
		setTelemetryConsent('allowed');

		expect(Sentry.init).toHaveBeenCalledTimes(1);
		const initCall = jest.mocked(Sentry.init).mock.calls[0];
		if (!initCall) throw new Error('Missing Sentry init call');
		const [initOptions] = initCall;
		if (!initOptions) throw new Error('Missing Sentry init options');
		const configureIntegrations = initOptions.integrations;
		expect(configureIntegrations).toEqual(expect.any(Function));
		if (typeof configureIntegrations !== 'function') throw new Error('Missing integrations filter');
		expect(configureIntegrations([{ name: 'GlobalHandlers' }, { name: 'BrowserSession' }])).toEqual(
			[{ name: 'GlobalHandlers' }]
		);
		expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'new-install-id' });
	});

	it('does not capture errors before tracking is allowed', () => {
		captureLoggedError({ message: 'Checkout failed' });

		expect(Sentry.captureException).not.toHaveBeenCalled();
		expect(Sentry.captureMessage).not.toHaveBeenCalled();
	});

	it('closes Sentry and forgets the install id when tracking is denied', () => {
		localStorageData.set('wcpos_install_id', 'existing-install-id');
		setTelemetryConsent('allowed');
		setTelemetryConsent('denied');

		expect(Sentry.close).toHaveBeenCalledTimes(1);
		expect(localStorage.removeItem).toHaveBeenCalledWith('wcpos_install_id');
		expect(localStorageData.has('wcpos_install_id')).toBe(false);
	});

	it('removes store origins from request and breadcrumb urls', () => {
		const event = scrubEvent({
			request: { url: 'https://merchant.example/wp-json/wcpos/v1?order=42' },
			breadcrumbs: [
				{ data: { url: 'https://store.example/products?search=shirt' } },
				{ data: { method: 'GET' } },
			],
		});

		expect(event.request?.url).toBe('/wp-json/wcpos/v1?order=42');
		expect(event.breadcrumbs?.[0].data?.url).toBe('/products?search=shirt');
		expect(event.breadcrumbs?.[1].data).toEqual({ method: 'GET' });
	});

	it('redacts credentials from scrubbed url query strings', () => {
		const event = scrubEvent({
			request: {
				url: 'https://merchant.example/checkout?access_token=secret-token&order=42',
			},
		});

		expect(event.request?.url).toBe('/checkout?access_token=[REDACTED]&order=42');
	});

	it('removes store origins from nested extra context urls', () => {
		const event = scrubEvent({
			extra: {
				context: {
					siteUrl: 'https://merchant.example/wp-json',
					attempts: [{ originalUrl: 'https://store.example/products?page=2' }],
				},
			},
		});

		expect(event.extra).toEqual({
			context: {
				siteUrl: '/wp-json',
				attempts: [{ originalUrl: '/products?page=2' }],
			},
		});
	});

	it('adds error-code grouping only when a code is provided', () => {
		expect(
			buildCaptureOptions({ message: 'Coded error', code: 123, context: { retry: 1 } })
		).toEqual({
			level: 'error',
			tags: { errorCode: '123' },
			fingerprint: ['123'],
			extra: { message: 'Coded error', context: { retry: 1 } },
		});
		expect(buildCaptureOptions({ message: 'Uncoded error' })).toEqual({
			level: 'error',
			extra: { message: 'Uncoded error', context: undefined },
		});
	});

	it.each([
		['Order 123 failed', 'Order {} failed'],
		['Product 123e4567-e89b-12d3-a456-426614174000 failed', 'Product {} failed'],
		['Product "Blue shirt" failed', 'Product {} failed'],
		["Product 'Blue shirt' failed", 'Product {} failed'],
	])('templates %s', (message, expected) => {
		expect(messageTemplate(message)).toBe(expected);
	});

	it('separates catch-all messages but preserves specific-code grouping', () => {
		const fingerprints = ['Barcode lookup failed', 'Stock refresh failed'].map(
			(message) => buildCaptureOptions({ message, code: 'PRODUCT999' }).fingerprint
		);
		expect(fingerprints).toEqual([
			['PRODUCT999', 'Barcode lookup failed'],
			['PRODUCT999', 'Stock refresh failed'],
		]);
		expect(
			buildCaptureOptions({ message: 'Order 123 failed', code: 'AUTH201' }).fingerprint
		).toEqual(['AUTH201']);
	});

	it('normalises merchant origins so one failure class is one issue, not one per store', () => {
		expect(messageTemplate('Failed to connect to https://shop.example.com/wp-json/: timeout')).toBe(
			'Failed to connect to {}/wp-json/: timeout'
		);
		expect(
			buildCaptureOptions({
				message: 'Failed to connect to https://a.example.com/wp-json/: timeout',
				code: 'AUTH999',
			}).fingerprint
		).toEqual(
			buildCaptureOptions({
				message: 'Failed to connect to https://b.example.org/wp-json/: timeout',
				code: 'AUTH999',
			}).fingerprint
		);
	});

	it('groups HTTP failures by method and endpoint template, whatever the code', () => {
		const products = buildCaptureOptions({
			message: 'HTTP request failed: GET /wp-json/wcpos/v2/products',
			code: 'SYNC131',
			context: { method: 'GET', endpoint: '/wp-json/wcpos/v2/products', status: 503 },
		}).fingerprint;
		const orders = buildCaptureOptions({
			message: 'HTTP request failed: GET /wp-json/wcpos/v2/orders/12',
			code: 'SYNC131',
			context: { method: 'GET', endpoint: '/wp-json/wcpos/v2/orders/12', status: 503 },
		}).fingerprint;
		const orders2 = buildCaptureOptions({
			message: 'HTTP request failed: GET /wp-json/wcpos/v2/orders/99',
			code: 'SYNC131',
			context: { method: 'GET', endpoint: '/wp-json/wcpos/v2/orders/99', status: 503 },
		}).fingerprint;
		expect(products).toEqual(['SYNC131', 'GET', '/wp-json/wcpos/v2/products']);
		expect(products).not.toEqual(orders);
		expect(orders).toEqual(orders2);
	});

	it('captures Error context as an exception', () => {
		setTelemetryConsent('allowed');
		const error = new Error('Checkout failed');
		captureLoggedError({ message: 'Checkout failed', code: 'E_CHECKOUT', context: { error } });
		expect(Sentry.captureException).toHaveBeenCalledWith(error, {
			level: 'error',
			tags: { errorCode: 'E_CHECKOUT' },
			fingerprint: ['E_CHECKOUT'],
			extra: { message: 'Checkout failed', context: { error } },
		});
		expect(Sentry.captureMessage).not.toHaveBeenCalled();
	});

	it('captures a log without Error context as a message', () => {
		setTelemetryConsent('allowed');
		captureLoggedError({ message: 'Checkout failed', context: { reason: 'offline' } });
		expect(Sentry.captureMessage).toHaveBeenCalledWith('Checkout failed', {
			level: 'error',
			extra: { message: 'Checkout failed', context: { reason: 'offline' } },
		});
		expect(Sentry.captureException).not.toHaveBeenCalled();
	});
});
