/**
 * The `setToast` seam, end to end.
 *
 * `apps/main` is the only place that owns both halves — the logger from
 * `@wcpos/utils` and the merchant-copy adapter from `@wcpos/core` — so it is
 * the only suite that can prove a `showToast: true` call site with no cashier
 * copy of its own reaches the Toaster as a translated merchant sentence rather
 * than the developer's log message.
 *
 * The `t` used here is backed by the REAL English catalogue, not a stub: the
 * assertions name the sentence a merchant actually reads.
 */
import en from '@wcpos/core/contexts/translations/locales/en/core.json';
import { createMerchantToast } from '@wcpos/core/contexts/merchant-toast';
import { getLogger, setToast } from '@wcpos/utils/logger';

// jest-expo hoists module state across files in a worker; a fresh registry per
// file keeps the logger's module-level toast handle from leaking between suites.
jest.resetModules();

const catalogue = en as Record<string, string>;
const t = (key: string) => catalogue[key] ?? key;

/** A real, verbatim call site: auth-error-handler.ts logs this developer string. */
const DEV_MESSAGE = 'promptAsync rejected - Authentication failed';
const CODE = 'AUTH301';

describe('logger toast → merchant sentence', () => {
	let shown: jest.Mock;

	beforeEach(() => {
		shown = jest.fn();
		setToast(createMerchantToast(t, shown));
	});

	afterAll(() => {
		setToast(() => {});
	});

	it('replaces the developer log message with the error code’s translated summary', () => {
		getLogger(['wcpos', 'test']).error(DEV_MESSAGE, { code: CODE, showToast: true });

		expect(shown).toHaveBeenCalledTimes(1);
		const config = shown.mock.calls[0][0];

		expect(config.title).toBe(catalogue[`health.logs.error_summary.${CODE}`]);
		expect(config.title).not.toBe(DEV_MESSAGE);
		// Sanity on the fixture: the catalogue really does carry a sentence for
		// this code, so the assertion above is not comparing two undefineds.
		expect(config.title).toEqual(expect.stringContaining('authentication plugin'));
	});

	it('carries the code’s action hint as the toast description', () => {
		getLogger(['wcpos', 'test']).error(DEV_MESSAGE, { code: CODE, showToast: true });

		expect(shown.mock.calls[0][0].description).toBe(catalogue[`health.logs.error_action.${CODE}`]);
	});

	it('never leaks the seam’s raw ingredients to the Toaster', () => {
		getLogger(['wcpos', 'test']).error(DEV_MESSAGE, { code: CODE, showToast: true });

		expect(shown.mock.calls[0][0]).not.toHaveProperty('merchantCopy');
		// The E2E selector policy's code-bearing test ID must survive the adapter.
		expect(shown.mock.calls[0][0].testId).toBe(`toast-${CODE}`);
	});

	it('leaves a call site that passes its own cashier copy untouched', () => {
		const explicit = 'Could not save the customer.';

		getLogger(['wcpos', 'test']).error(DEV_MESSAGE, {
			code: CODE,
			showToast: true,
			toast: { title: explicit },
		});

		const config = shown.mock.calls[0][0];
		expect(config.title).toBe(explicit);
		// An explicit title is deliberate and complete: the action hint must not
		// be bolted onto it, or all 33 such sites grow a second sentence.
		expect(config.description).toBeUndefined();
	});

	it('keeps an explicit secondary message ahead of the action hint', () => {
		getLogger(['wcpos', 'test']).error(DEV_MESSAGE, {
			code: CODE,
			showToast: true,
			toast: { text2: 'Order #42' },
		});

		const config = shown.mock.calls[0][0];
		expect(config.title).toBe(catalogue[`health.logs.error_summary.${CODE}`]);
		expect(config.description).toBe('Order #42');
	});

	it('falls back to the log message only when there is no code at all', () => {
		getLogger(['wcpos', 'test']).warn(DEV_MESSAGE, { showToast: true });

		expect(shown.mock.calls[0][0].title).toBe(DEV_MESSAGE);
	});

	it('falls back to the log message for a code the catalogue does not know', () => {
		getLogger(['wcpos', 'test']).warn(DEV_MESSAGE, {
			showToast: true,
			context: { errorCode: 'NOSUCH999' },
		});

		expect(shown.mock.calls[0][0].title).toBe(DEV_MESSAGE);
	});
});
