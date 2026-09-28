import * as React from 'react';

import { useRouter } from 'expo-router';

import { Notice } from '@wcpos/components/notice';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import { reloadApp } from '../../../../utils/reload-app';
import { useStorageDegraded } from '../../hooks/use-storage-health';

const bannerLogger = getLogger(['wcpos', 'pos', 'outage-banner']);

/**
 * Shown above the product grid while the local database has lost its storage
 * worker (#163) — the one outage that blocks scanning, checkout, saving and
 * voiding all at once, and whose only recovery is a reload.
 *
 * Engine outages (offline, still bootstrapping) deliberately have no banner:
 * local scanning keeps working through them, so the cashier only hears about
 * them from the scan toast when a lookup actually needs the store.
 */
export function StorageOutageBanner() {
	const storageDegraded = useStorageDegraded();
	const router = useRouter();
	const t = useT();

	/**
	 * A production native build has no programmatic reload (no expo-updates), so
	 * say so rather than leaving a button that silently does nothing while the
	 * register is blocked.
	 */
	const handleReload = React.useCallback(() => {
		if (reloadApp()) return;
		bannerLogger.error('App reload is required after local storage failure', {
			toast: { title: t('pos_products.scan_storage_outage_restart_manually') },
			// Same outage use-barcode reports — keep the code (and its docs page) consistent.
			code: ERROR_CODES.LOCAL_DB_UNAVAILABLE,
			showToast: true,
		});
	}, [t]);

	if (!storageDegraded) {
		return null;
	}

	return (
		<Notice
			tone="bad"
			title={t('pos_products.scan_storage_outage_banner')}
			testID="storage-outage-banner"
			actions={[
				{
					label: t('pos_products.scan_storage_outage_reload'),
					onPress: handleReload,
					testID: 'storage-outage-reload',
				},
				{
					label: t('pos_products.scan_outage_view_status'),
					onPress: () => router.push('/health/database'),
					testID: 'scan-outage-view-status',
				},
			]}
		/>
	);
}
