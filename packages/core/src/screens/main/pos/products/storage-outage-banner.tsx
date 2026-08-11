import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useRouter } from 'expo-router';

import { Text } from '@wcpos/components/text';
import { getLogger } from '@wcpos/utils/logger';

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
		bannerLogger.error(t('pos_products.scan_storage_outage_restart_manually'), {
			showToast: true,
			// The local database is what's broken — don't try to persist this.
			saveToDb: false,
		});
	}, [t]);

	if (!storageDegraded) {
		return null;
	}

	return (
		<View
			testID="storage-outage-banner"
			className="border-destructive/40 bg-destructive/10 flex-row items-center gap-2 rounded-md border p-2"
		>
			<Text className="text-destructive flex-1 text-sm">
				{t('pos_products.scan_storage_outage_banner')}
			</Text>
			{/*
			 * Reload is the only recovery from a dead worker (the storage worker is
			 * module-scope and shared app-wide), so the banner carries the action
			 * rather than only describing it.
			 */}
			<Pressable testID="storage-outage-reload" onPress={handleReload}>
				<Text className="text-destructive web:hover:opacity-80 text-sm font-medium underline">
					{t('pos_products.scan_storage_outage_reload')}
				</Text>
			</Pressable>
			<Pressable testID="scan-outage-view-status" onPress={() => router.push('/health/database')}>
				<Text className="text-destructive text-sm font-medium underline">
					{t('pos_products.scan_outage_view_status')}
				</Text>
			</Pressable>
		</View>
	);
}
