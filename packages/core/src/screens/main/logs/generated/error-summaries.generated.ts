// GENERATED — do not edit by hand; run pnpm generate:error-codes
import type { ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';

/** The translate function shape `useT()` returns. */
type TranslateError = (key: string) => string;

/**
 * The plain-language reason for an error code, translated at render time — so a
 * row written months ago on a Spanish till reads in whatever language the till
 * runs today, the same contract `translateEventTitle` holds for row titles.
 *
 * No `defaultValue`: the English catalogue is bundled statically and IS the
 * fallback language, and this generator writes those strings into it from the
 * registry. A defaultValue would be a third copy of every summary that nothing
 * renders and this generator could silently drift from.
 */
export function translateErrorSummary(t: TranslateError, code: ErrorCode): string {
	switch (code) {
		case 'SYNC101':
			return t('health.logs.error_summary.SYNC101');
		case 'SYNC111':
			return t('health.logs.error_summary.SYNC111');
		case 'SYNC121':
			return t('health.logs.error_summary.SYNC121');
		case 'SYNC131':
			return t('health.logs.error_summary.SYNC131');
		case 'SYNC141':
			return t('health.logs.error_summary.SYNC141');
		case 'SYNC201':
			return t('health.logs.error_summary.SYNC201');
		case 'SYNC211':
			return t('health.logs.error_summary.SYNC211');
		case 'SYNC301':
			return t('health.logs.error_summary.SYNC301');
		case 'SYNC311':
			return t('health.logs.error_summary.SYNC311');
		case 'SYNC321':
			return t('health.logs.error_summary.SYNC321');
		case 'SYNC331':
			return t('health.logs.error_summary.SYNC331');
		case 'SYNC341':
			return t('health.logs.error_summary.SYNC341');
		case 'AUTH101':
			return t('health.logs.error_summary.AUTH101');
		case 'AUTH201':
			return t('health.logs.error_summary.AUTH201');
		case 'AUTH301':
			return t('health.logs.error_summary.AUTH301');
		case 'AUTH311':
			return t('health.logs.error_summary.AUTH311');
		case 'AUTH401':
			return t('health.logs.error_summary.AUTH401');
		case 'CHECKOUT101':
			return t('health.logs.error_summary.CHECKOUT101');
		case 'CHECKOUT201':
			return t('health.logs.error_summary.CHECKOUT201');
		case 'CHECKOUT211':
			return t('health.logs.error_summary.CHECKOUT211');
		case 'CHECKOUT301':
			return t('health.logs.error_summary.CHECKOUT301');
		case 'PAYMENT101':
			return t('health.logs.error_summary.PAYMENT101');
		case 'PAYMENT201':
			return t('health.logs.error_summary.PAYMENT201');
		case 'PAYMENT301':
			return t('health.logs.error_summary.PAYMENT301');
		case 'PAYMENT401':
			return t('health.logs.error_summary.PAYMENT401');
		case 'PAYMENT501':
			return t('health.logs.error_summary.PAYMENT501');
		case 'PRINT101':
			return t('health.logs.error_summary.PRINT101');
		case 'PRINT201':
			return t('health.logs.error_summary.PRINT201');
		case 'PRINT301':
			return t('health.logs.error_summary.PRINT301');
		case 'PRODUCT101':
			return t('health.logs.error_summary.PRODUCT101');
		case 'PRODUCT111':
			return t('health.logs.error_summary.PRODUCT111');
		case 'PRODUCT201':
			return t('health.logs.error_summary.PRODUCT201');
		case 'PRODUCT301':
			return t('health.logs.error_summary.PRODUCT301');
		case 'PRODUCT401':
			return t('health.logs.error_summary.PRODUCT401');
		case 'LICENSE101':
			return t('health.logs.error_summary.LICENSE101');
		case 'LICENSE201':
			return t('health.logs.error_summary.LICENSE201');
		case 'LICENSE301':
			return t('health.logs.error_summary.LICENSE301');
		case 'CLIENT101':
			return t('health.logs.error_summary.CLIENT101');
		case 'CLIENT201':
			return t('health.logs.error_summary.CLIENT201');
		case 'CLIENT211':
			return t('health.logs.error_summary.CLIENT211');
		case 'CLIENT999':
			return t('health.logs.error_summary.CLIENT999');
		case 'SYNC999':
			return t('health.logs.error_summary.SYNC999');
		case 'AUTH999':
			return t('health.logs.error_summary.AUTH999');
		case 'CHECKOUT999':
			return t('health.logs.error_summary.CHECKOUT999');
		case 'PAYMENT999':
			return t('health.logs.error_summary.PAYMENT999');
		case 'PRINT999':
			return t('health.logs.error_summary.PRINT999');
		case 'PRODUCT999':
			return t('health.logs.error_summary.PRODUCT999');
		case 'LICENSE999':
			return t('health.logs.error_summary.LICENSE999');
		case 'SYNC401':
			return t('health.logs.error_summary.SYNC401');
		case 'SYNC411':
			return t('health.logs.error_summary.SYNC411');
		case 'SYNC221':
			return t('health.logs.error_summary.SYNC221');
		case 'CHECKOUT401':
			return t('health.logs.error_summary.CHECKOUT401');
		case 'PRODUCT411':
			return t('health.logs.error_summary.PRODUCT411');
		case 'CLIENT111':
			return t('health.logs.error_summary.CLIENT111');
		case 'CLIENT121':
			return t('health.logs.error_summary.CLIENT121');
		case 'AUTH111':
			return t('health.logs.error_summary.AUTH111');
		case 'AUTH121':
			return t('health.logs.error_summary.AUTH121');
		case 'AUTH321':
			return t('health.logs.error_summary.AUTH321');
		case 'AUTH331':
			return t('health.logs.error_summary.AUTH331');
		case 'AUTH411':
			return t('health.logs.error_summary.AUTH411');
		case 'AUTH421':
			return t('health.logs.error_summary.AUTH421');
		case 'AUTH431':
			return t('health.logs.error_summary.AUTH431');
		case 'AUTH441':
			return t('health.logs.error_summary.AUTH441');
		case 'HOST101':
			return t('health.logs.error_summary.HOST101');
		case 'HOST111':
			return t('health.logs.error_summary.HOST111');
		case 'HOST121':
			return t('health.logs.error_summary.HOST121');
		case 'HOST131':
			return t('health.logs.error_summary.HOST131');
		case 'HOST141':
			return t('health.logs.error_summary.HOST141');
		case 'HOST151':
			return t('health.logs.error_summary.HOST151');
		case 'HOST161':
			return t('health.logs.error_summary.HOST161');
		case 'SYNC151':
			return t('health.logs.error_summary.SYNC151');
		case 'SYNC161':
			return t('health.logs.error_summary.SYNC161');
		case 'SYNC171':
			return t('health.logs.error_summary.SYNC171');
		case 'SYNC181':
			return t('health.logs.error_summary.SYNC181');
		case 'CHECKOUT111':
			return t('health.logs.error_summary.CHECKOUT111');
		case 'PRODUCT321':
			return t('health.logs.error_summary.PRODUCT321');
		case 'PRODUCT421':
			return t('health.logs.error_summary.PRODUCT421');
		case 'PRINT311':
			return t('health.logs.error_summary.PRINT311');
		case 'CLIENT131':
			return t('health.logs.error_summary.CLIENT131');
		case 'CLIENT141':
			return t('health.logs.error_summary.CLIENT141');
		case 'CLIENT142':
			return t('health.logs.error_summary.CLIENT142');
		case 'CLIENT143':
			return t('health.logs.error_summary.CLIENT143');
		case 'CLIENT144':
			return t('health.logs.error_summary.CLIENT144');
		case 'CHECKOUT411':
			return t('health.logs.error_summary.CHECKOUT411');
		case 'CHECKOUT421':
			return t('health.logs.error_summary.CHECKOUT421');
		default: {
			const exhaustive: never = code;
			return exhaustive;
		}
	}
}
