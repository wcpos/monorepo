import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useRouter } from 'expo-router';

import { Text } from '@wcpos/components/text';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../../contexts/translations';
import { reloadApp } from '../../../../utils/reload-app';
import { useEngineStatus } from '../../hooks/use-engine-monitor';
import { useStorageDegraded } from '../../hooks/use-storage-health';

const bannerLogger = getLogger(['wcpos', 'pos', 'outage-banner']);

/**
 * Shown above the product grid while barcode lookups can't be served — either
 * because the sync engine can't reach the store, or because the local database
 * lost its storage worker (#163). Scan toasts point the cashier here.
 */
export function EngineOutageBanner() {
	const status = useEngineStatus();
	const { status: onlineStatus } = useOnlineStatus();
	const storageDegraded = useStorageDegraded();
	const router = useRouter();
	const t = useT();
	const isOffline = onlineStatus === 'offline';
	const isEngineUnavailable =
		status.gatedBy === 'lifecycle' || status.gatedBy === 'bootstrap-failed';

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

	if (!storageDegraded && !isOffline && !isEngineUnavailable) {
		return null;
	}

	// Degraded storage outranks any engine outage: an offline engine still lets the
	// local catalogue answer scans, a dead storage worker takes everything with it
	// and is the only one of the three that needs a reload.
	return (
		<View
			testID={storageDegraded ? 'storage-outage-banner' : 'engine-outage-banner'}
			className="border-destructive/40 bg-destructive/10 flex-row items-center gap-2 rounded-md border p-2"
		>
			<Text className="text-destructive flex-1 text-sm">
				{storageDegraded
					? t('pos_products.scan_storage_outage_banner')
					: isOffline
						? t('pos_products.scan_outage_banner')
						: t('pos_products.scan_engine_unavailable_banner')}
			</Text>
			{/*
			 * Reload is the only recovery from a dead worker (the storage worker is
			 * module-scope and shared app-wide), so the degraded-storage banner carries
			 * the action rather than only describing it. An engine outage recovers on
			 * its own — no reload offered there.
			 */}
			{storageDegraded ? (
				<Pressable testID="storage-outage-reload" onPress={handleReload}>
					<Text className="text-destructive web:hover:opacity-80 text-sm font-medium underline">
						{t('pos_products.scan_storage_outage_reload')}
					</Text>
				</Pressable>
			) : null}
			<Pressable testID="scan-outage-view-status" onPress={() => router.push('/health/database')}>
				<Text className="text-destructive text-sm font-medium underline">
					{t('pos_products.scan_outage_view_status')}
				</Text>
			</Pressable>
		</View>
	);
}
