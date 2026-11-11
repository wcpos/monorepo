import * as React from 'react';

import { useRouter } from 'expo-router';

import { useIsPhone } from '@wcpos/components/lib/device';
import { useGround } from '@wcpos/components/lib/ground';
import { cn } from '@wcpos/components/lib/utils';
import { Notice } from '@wcpos/components/notice';
import {
	dismissScannerResetNotice,
	isScannerResetNoticeArmed,
	subscribeScannerResetNotice,
} from '@wcpos/utils/scanner-reset-notice';

import { useT } from '../../../../contexts/translations';

/** Settings → Barcode Scanning, where the cashier re-enters the settings the upgrade reset. */
export const BARCODE_SCANNING_SETTINGS_HREF = '/settings/barcode-scanning';

// One-time notice that the upgrade purge reset this till's scanner settings. It subscribes, since
// the purge arms it after `engine.ready`. Gutters as `SessionHoldBanner`.
export function ScannerResetNotice({ gutter = 'page' }: { gutter?: 'page' | 'dense' }) {
	const armed = React.useSyncExternalStore(subscribeScannerResetNotice, isScannerResetNoticeArmed);
	const t = useT();
	const router = useRouter();
	const phone = useIsPhone();
	const ground = useGround();
	if (!armed) return null;

	return (
		<Notice
			tone="info"
			title={t('settings.barcode_reset_notice')}
			actions={[
				{
					label: t('settings.barcode_reset_notice_review'),
					onPress: () => {
						dismissScannerResetNotice();
						router.push(BARCODE_SCANNING_SETTINGS_HREF);
					},
					testID: 'scanner-reset-notice-review',
				},
				{
					label: t('settings.barcode_reset_notice_dismiss'),
					onPress: dismissScannerResetNotice,
					testID: 'scanner-reset-notice-dismiss',
				},
			]}
			className={cn(!phone && (gutter === 'page' ? cn(ground.mx, ground.mt) : 'mx-2 mt-2'))}
			testID="scanner-reset-notice"
		/>
	);
}
