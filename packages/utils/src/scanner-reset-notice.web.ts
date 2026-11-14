import {
	createScannerResetNotice,
	SCANNER_RESET_NOTICE_KEY,
} from './scanner-reset-notice-listeners';

export { SCANNER_RESET_NOTICE_KEY };

// Web and Electron: localStorage. A restricted embedded browser may throw; the wrapper absorbs it.
const notice = createScannerResetNotice({
	read: () => window.localStorage.getItem(SCANNER_RESET_NOTICE_KEY) === '1',
	write: () => window.localStorage.setItem(SCANNER_RESET_NOTICE_KEY, '1'),
	clear: () => window.localStorage.removeItem(SCANNER_RESET_NOTICE_KEY),
});

export const armScannerResetNotice = notice.arm;
export const isScannerResetNoticeArmed = notice.isArmed;
export const dismissScannerResetNotice = notice.dismiss;
export const subscribeScannerResetNotice = notice.subscribe;
