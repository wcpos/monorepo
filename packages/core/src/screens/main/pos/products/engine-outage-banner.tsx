import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useRouter } from 'expo-router';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useEngineStatus } from '../../hooks/use-engine-monitor';

/**
 * Shown above the product grid only while the sync engine can't serve
 * online barcode lookups; scan toasts point the cashier here.
 */
export function EngineOutageBanner() {
	const status = useEngineStatus();
	const router = useRouter();
	const t = useT();

	if (status.connectivity !== 'offline' && status.gatedBy === null) {
		return null;
	}

	return (
		<View
			testID="engine-outage-banner"
			className="border-destructive/40 bg-destructive/10 flex-row items-center gap-2 rounded-md border p-2"
		>
			<Text className="text-destructive flex-1 text-sm">
				{t('pos_products.scan_outage_banner', {
					defaultValue: 'Scanning unavailable — sync engine offline.',
				})}
			</Text>
			<Pressable onPress={() => router.push('/health/database')}>
				<Text className="text-destructive text-sm font-medium underline">
					{t('pos_products.scan_outage_view_status', { defaultValue: 'View status' })}
				</Text>
			</Pressable>
		</View>
	);
}
