import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { TitleBarStripPortal } from '@wcpos/components/edge-surface';
import { HStack } from '@wcpos/components/hstack';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';
import { requestCashierSheet } from '../cashier-entry/cashier-sheet-request';
import { BarControls, useOnlineBadge } from './index';

/**
 * The desktop title bar's contents, the strip's one owner, rendered once by the drawer layout
 * (Paul, 2026-10-29): the store name on the left, the door to the cashier sheet; the drag region
 * in the middle; Offline, the bell and the avatar on the right. Its controls are the strip's own
 * height (the chrome sizes the control token to it). Nothing without a strip.
 */
export function TitleBarStripContent() {
	const { store } = useStoreSession();
	const storeName = useDocField(store, (value) => value.name) as string;
	const status = useOnlineBadge();
	return (
		<TitleBarStripPortal>
			<HStack className="flex-1 gap-2 px-2">
				<Button
					testID="title-bar-store"
					variant="ghost"
					className="min-w-0 shrink px-2 py-0"
					onPress={requestCashierSheet}
				>
					<Text variant="key" numberOfLines={1}>
						{storeName}
					</Text>
				</Button>
				<View className="flex-1" />
				{status && <StatusBadge {...status} testID="title-bar-status" />}
				<BarControls testID="title-bar" inTitleBar />
			</HStack>
		</TitleBarStripPortal>
	);
}
