import { View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';

interface SyncingBadgeProps {
	isSyncing: boolean;
}

export function SyncingBadge({ isSyncing }: SyncingBadgeProps) {
	const t = useT();

	if (!isSyncing) {
		return null;
	}

	return (
		<View className="bg-muted self-center rounded-full px-3 py-1">
			<HStack className="items-center gap-1.5">
				<Icon name="arrowRotateRight" size="xs" variant="muted" />
				<Text className="text-muted-foreground text-xs font-medium">
					{t('receipt.syncing_with_server', 'Syncing with server...')}
				</Text>
			</HStack>
		</View>
	);
}
