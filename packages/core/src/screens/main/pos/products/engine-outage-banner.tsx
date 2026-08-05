import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useRouter } from 'expo-router';

import { Text } from '@wcpos/components/text';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { useT } from '../../../../contexts/translations';
import { useEngineStatus } from '../../hooks/use-engine-monitor';
import { useStorageDegraded } from '../../hooks/use-storage-health';

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
			<Pressable testID="scan-outage-view-status" onPress={() => router.push('/health/database')}>
				<Text className="text-destructive text-sm font-medium underline">
					{t('pos_products.scan_outage_view_status')}
				</Text>
			</Pressable>
		</View>
	);
}
