import * as Sentry from '@sentry/browser';

jest.mock('@sentry/browser');
jest.mock('../app-info', () => ({ AppInfo: { version: '1.0.0', platform: 'web' } }));

(global as any).__DEV__ = true;

const { buildCaptureOptions, captureLoggedError, scrubEvent } =
	jest.requireActual<typeof import('./sentry-sink.web')>('./sentry-sink.web');

describe('sentry-sink.web', () => {
	beforeEach(() => jest.clearAllMocks());

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
		captureLoggedError({ message: 'Checkout failed', context: { reason: 'offline' } });
		expect(Sentry.captureMessage).toHaveBeenCalledWith('Checkout failed', {
			level: 'error',
			extra: { message: 'Checkout failed', context: { reason: 'offline' } },
		});
		expect(Sentry.captureException).not.toHaveBeenCalled();
	});
});
