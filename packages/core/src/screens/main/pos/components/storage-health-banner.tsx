import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useStorageHealth } from '../../contexts/storage-health/provider';

export function StorageHealthBanner() {
	const { isDegraded } = useStorageHealth();
	const t = useT();

	if (!isDegraded) {
		return null;
	}

	return React.createElement(
		HStack,
		{ testID: 'storage-health-banner', className: 'bg-destructive flex-col px-3 py-2' },
		React.createElement(
			Text,
			{ className: 'text-destructive-foreground text-sm font-medium' },
			t('common.pos_storage_connection_lost')
		),
		React.createElement(
			Text,
			{ className: 'text-destructive-foreground text-sm' },
			t('common.stop_using_this_register_until_reloaded')
		)
	);
}
