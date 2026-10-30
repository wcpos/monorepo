import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { TitleBarStripPortal } from '@wcpos/components/edge-surface';
import { HStack } from '@wcpos/components/hstack';
import { StatusBadge } from '@wcpos/components/status-badge';

import { useRegisterBarState } from '../../pos/cart/use-register-bar-state';
import { requestCashierSheet } from '../cashier-entry/cashier-sheet-request';
import { BarControls } from './index';

/**
 * The desktop title bar's contents, the strip's one owner, rendered once by the drawer layout
 * (Paul, 2026-10-29): the till's place on the left, the door to the cashier sheet; the drag region
 * in the middle; the register pill, the bell and the avatar on the right (Paul, 2026-10-30: the
 * POS bar under it draws nothing). Its controls are the strip's own height (the chrome sizes the
 * control token to it) and `bare`: no surface, the label or glyph lifts. Nothing without a strip.
 */
export function TitleBarStripContent() {
	return (
		<TitleBarStripPortal>
			<TitleBarRow />
		</TitleBarStripPortal>
	);
}

/** Inside the portal, so the register reads run only where a strip draws them. */
function TitleBarRow() {
	const { place, pillLabel } = useRegisterBarState();
	return (
		<HStack className="flex-1 gap-2 px-2">
			<Button
				testID="title-bar-store"
				variant="bare"
				className="min-w-0 shrink px-2 py-0"
				onPress={requestCashierSheet}
			>
				{place}
			</Button>
			<View className="flex-1" />
			{pillLabel && <StatusBadge testID="title-bar-pill" label={pillLabel} variant="warning" />}
			<BarControls testID="title-bar" inTitleBar />
		</HStack>
	);
}
