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
(globalThis as any).__DEV__ = false;
Object.defineProperty(globalThis, 'window', {
	configurable: true,
	value: {
		localStorage,
		crypto: { randomUUID: () => 'new-install-id' },
	},
});

const { buildCaptureOptions, captureLoggedError, scrubEvent, setTelemetryConsent } =
	jest.requireActual<typeof import('./sentry-sink.web')>('./sentry-sink.web');
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
