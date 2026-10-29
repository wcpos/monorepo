import * as React from 'react';
import { View } from 'react-native';

import { useIsFocused } from 'expo-router/react-navigation';

import { cn } from '@wcpos/components/lib/utils';
import { PressableSurface } from '@wcpos/components/pressable-surface';
import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';
import { takeRedirectReturn } from '../../../../hooks/use-wcpos-auth/redirect-result';
import { UserSheet } from '../../pos/cart/user-sheet';
import { UserAvatar } from '../user-avatar';
import { consumeCashierSheetRequest, useCashierSheetRequested } from './cashier-sheet-request';

/**
 * The cashier entry: the avatar that opens the one cashier surface (`UserSheet`, CODING_STANDARDS
 * § Design, Situation → overlay), the sheet's host, and the redirect-return claim. It is mounted
 * once per screen tree: in the bar below `lg` (`BarControls`) and on the rail on `lg`
 * (`DrawerContent`), so no layout needs a sheet of its own just to claim a login.
 */
export function CashierEntry({
	testID,
	placement,
	portalHost,
	onOpenRegister,
}: {
	testID: string;
	/** `bar`: a control-height square in a page or register bar; `rail`: the rail's 48 square. */
	placement: 'bar' | 'rail';
	/** The POS host inside the till; the root (`null`) where the till may be hidden or detached. */
	portalHost: string | null;
	onOpenRegister?: () => void;
}) {
	const { site, wpCredentials } = useStoreSession();
	const displayName = useDocField(wpCredentials, (value) => value.display_name) as string;
	const loginUrl = site.wcpos_login_url;
	const [open, setOpen] = React.useState(false);
	const focused = useIsFocused();
	const canClaim = placement === 'rail' || focused;
	const requested = useCashierSheetRequested();
	React.useEffect(() => {
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- this is a one-shot external request, claimed after commit by the visible entry.
		if (canClaim && requested && consumeCashierSheetRequest()) {
			// eslint-disable-next-line react-hooks/set-state-in-effect, react-you-might-not-need-an-effect/no-adjust-state-on-prop-change -- claim the external request at commit, never in a discarded render.
			setOpen(true);
		}
	}, [canClaim, requested]);
	// The redirect-return claim: after a full-page OAuth return for this site the sheet opens, so
	// its Add user consumer mounts to claim the one-shot result, as Connect does. Taken once per
	// page load, by the first entry to COMMIT: an effect, so a render React discards (a Suspense
	// retry) never spends it, and a second entry on screen (the phone's other tab) opens nothing.
	React.useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- the take is a one-shot read of module state (an external system) that must happen at commit: taken in a render or state initializer, a render React discards would spend it and no sheet would open.
		if (takeRedirectReturn(loginUrl)) setOpen(true);
	}, [loginUrl]);
	// One cell: a closed sheet still mounts an empty root, which in a bar's gap row would be a
	// cell of its own pushing the controls out of line (Paul, 2026-10-09).
	return (
		<View>
			<PressableSurface
				role="button"
				testID={testID}
				accessibilityLabel={displayName}
				// The rail's items lift onto the card (NavItem); a bar's controls wash muted (IconButton).
				wash={placement === 'rail' ? 'card' : 'muted'}
				className={cn(
					'items-center justify-center rounded-lg',
					placement === 'rail' ? 'size-12' : 'size-ctl'
				)}
				onPress={() => setOpen(true)}
			>
				<UserAvatar wpCredentials={wpCredentials} displayName={displayName} />
			</PressableSurface>
			<UserSheet
				open={open}
				onOpenChange={setOpen}
				portalHost={portalHost}
				onOpenRegister={onOpenRegister}
			/>
		</View>
	);
}
