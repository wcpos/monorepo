import * as React from 'react';
import { View } from 'react-native';

import { useIsFocused } from 'expo-router/react-navigation';

import { StatusBadge } from '@wcpos/components/status-badge';
import { Button } from '@wcpos/components/button';
// The strip's context alone: the surface module brings the safe-area ESM into the bar's suite.
import { useTitleBarStrip } from '@wcpos/components/edge-surface/title-bar-strip';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';

import {
	consumeRegisterPanelRequest,
	requestRegisterPanel,
	useRegisterPanelPane,
	useRegisterPanelRequested,
} from './register-panel-request';
import { RegisterPanel } from './register-panel';
import { useStoreSession } from '../../../../contexts/app-state';
import { BarControls, useBarMenu } from '../../components/bar-controls';
import { useRegisterBarState } from './use-register-bar-state';
import { requestCashierSheet } from '../../components/cashier-entry/cashier-sheet-request';

export function RegisterBar({
	panelOpen,
	onPanelOpenChange,
}: {
	panelOpen: boolean;
	onPanelOpenChange: (open: boolean) => void;
}) {
	const focused = useIsFocused();
	const panelRequested = useRegisterPanelRequested();
	const initialPane = useRegisterPanelPane();
	React.useEffect(() => {
		if (focused && panelRequested && consumeRegisterPanelRequest()) onPanelOpenChange(true);
	}, [focused, panelRequested, onPanelOpenChange]);
	const { wpCredentials } = useStoreSession();
	const menu = useBarMenu();
	const stores = useDocField(wpCredentials, (value) => value.stores) as string[];
	const { place, pillLabel } = useRegisterBarState();
	// The desktop title bar carries the place and the pill (Paul, 2026-10-30): under it the row is
	// hidden, its avatarless entry mounted; a phone-width window keeps the row for its menu.
	const underStrip = useTitleBarStrip().height > 0 && !menu;
	// The sheets live beside the bar, not in it: a closed Dialog still mounts an empty root,
	// and inside the bar's gap row that root was an invisible 8 pt cell pushing the bell and
	// the avatar out of line with the row below (Paul, 2026-10-09). The bar has no register
	// button: the avatar's sheet is the one door to the panel (Paul, 2026-10-29).
	return (
		<>
			<HStack className={cn('border-border h-12 gap-2 border-b px-2', underStrip && 'hidden')}>
				{menu && (
					<IconButton
						name="menu"
						testID="pos-drawer-open-button"
						accessibilityLabel={menu.label}
						onPress={menu.onPress}
					/>
				)}
				<View className="min-w-0 shrink">
					{stores?.length > 1 ? (
						<Button
							testID="register-bar-store"
							variant="ghost"
							className="min-w-11 shrink items-start px-0"
							onPress={requestCashierSheet}
						>
							{/* The bar's title, not a quiet action: it keeps the foreground over the ghost's muted label. */}
							<Text
								testID="register-bar-place"
								className="text-foreground text-base font-semibold"
								numberOfLines={1}
							>
								{place}
							</Text>
						</Button>
					) : (
						<Text testID="register-bar-place" className="text-base font-semibold" numberOfLines={1}>
							{place}
						</Text>
					)}
				</View>
				{pillLabel && (
					<StatusBadge testID="register-bar-pill" label={pillLabel} variant="warning" />
				)}
				<View className="flex-1" />
				<BarControls
					testID="register-bar"
					portalHost="pos"
					onOpenRegister={(pane) => requestRegisterPanel(pane)}
				/>
			</HStack>
			{/* Always mounted: on web the shell can only play the panel's exit while the caller keeps
			    rendering the closed Dialog (OVERLAY_EXIT_MOUNTED); a conditional mount tore it down in
			    the same commit, so the panel vanished where every other sheet slides. */}
			{/* The panel reads the cashier list through a suspending resource; its first mount must
			    not bubble past the bar (the dialog is closed then, so an empty fallback shows nothing). */}
			<React.Suspense fallback={null}>
				<RegisterPanel
					open={panelOpen}
					initialPane={initialPane}
					onOpenChange={onPanelOpenChange}
				/>
			</React.Suspense>
		</>
	);
}
