import en from './translations/locales/en/core.json';
import { createMerchantToast, resolveMerchantToastText } from './merchant-toast';

const catalogue = en as Record<string, string>;
const t = (key: string) => catalogue[key] ?? key;

const DEV_MESSAGE = 'Failed to save site data: request timed out';

describe('resolveMerchantToastText', () => {
	it('gives an explicit title precedence over everything', () => {
		expect(
			resolveMerchantToastText(t, {
				explicitTitle: 'Could not save the site.',
				errorCode: 'AUTH301',
				logMessage: DEV_MESSAGE,
			})
		).toEqual({ title: 'Could not save the site.' });
	});

	it('resolves a coded call to the catalogue’s translated summary and action', () => {
		expect(resolveMerchantToastText(t, { errorCode: 'SYNC111', logMessage: DEV_MESSAGE })).toEqual({
			title: catalogue['health.logs.error_summary.SYNC111'],
			description: catalogue['health.logs.error_action.SYNC111'],
		});
	});

	it('uses the log message only when there is no code', () => {
		expect(resolveMerchantToastText(t, { logMessage: DEV_MESSAGE })).toEqual({
			title: DEV_MESSAGE,
		});
	});

	it('uses the log message rather than showing an unresolved i18n key', () => {
		// i18next returns the KEY for a missing string. A cashier reading
		// "health.logs.error_summary.SYNC111" is worse off than before the fix.
		const missing = (key: string) => key;

		expect(
			resolveMerchantToastText(missing, { errorCode: 'SYNC111', logMessage: DEV_MESSAGE })
		).toEqual({ title: DEV_MESSAGE });
	});

	it('ignores a code that is not in the catalogue', () => {
		expect(
			resolveMerchantToastText(t, { errorCode: 'NOT_A_CODE', logMessage: DEV_MESSAGE })
		).toEqual({ title: DEV_MESSAGE });
	});
});

describe('createMerchantToast', () => {
	it('strips the seam field and keeps every other toast option', () => {
		const show = jest.fn();

		const showToast = createMerchantToast(t, show);

		showToast({
			type: 'error',
			testId: 'toast-SYNC111',
			closeButton: true,
			title: DEV_MESSAGE,
			merchantCopy: { errorCode: 'SYNC111', logMessage: DEV_MESSAGE },
		});

		expect(show).toHaveBeenCalledWith({
			type: 'error',
			testId: 'toast-SYNC111',
			closeButton: true,
			title: catalogue['health.logs.error_summary.SYNC111'],
			description: catalogue['health.logs.error_action.SYNC111'],
		});
	});

	it('passes a config with no seam field straight through', () => {
		const show = jest.fn();
		const config = { type: 'success', title: 'Order saved' };

		createMerchantToast(t, show)(config);

		expect(show).toHaveBeenCalledWith(config);
	});
});
