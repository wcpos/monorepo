import { File, Paths } from 'expo-file-system';

import {
	createScannerResetNotice,
	SCANNER_RESET_NOTICE_KEY,
} from './scanner-reset-notice-listeners';

export { SCANNER_RESET_NOTICE_KEY };

// Native has no localStorage: a marker file in the document directory, outside every database
// directory, so clearing the databases never takes the flag with it.
const markerFile = () => new File(Paths.document, SCANNER_RESET_NOTICE_KEY);

const notice = createScannerResetNotice({
	read: () => markerFile().exists,
	write: () => markerFile().writeSync('1'),
	clear: () => {
		const file = markerFile();
		if (file.exists) file.delete();
	},
});

export const armScannerResetNotice = notice.arm;
export const isScannerResetNoticeArmed = notice.isArmed;
export const dismissScannerResetNotice = notice.dismiss;
export const subscribeScannerResetNotice = notice.subscribe;
