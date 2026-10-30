import * as React from 'react';
import { View } from 'react-native';

import { useIsFocused } from 'expo-router/react-navigation';

import { PressableSurface } from '@wcpos/components/pressable-surface';
import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';
import { takeRedirectReturn } from '../../../../hooks/use-wcpos-auth/redirect-result';
import { useCurrentOrderOptional } from '../../pos/contexts/current-order/context';
import { UserSheet } from '../../pos/cart/user-sheet';
import { RegisterPanel } from '../../pos/cart/register-panel';
import { UserAvatar } from '../user-avatar';
import {
	consumeCashierSheetRequest,
	requestCashierSheet,
	tillEntryFocused,
	useCashierSheetRequested,
	useTillEntry,
} from './cashier-sheet-request';

/**
 * The cashier entry: the avatar that opens the one cashier surface (`UserSheet`, CODING_STANDARDS
 * § Design, Situation → overlay), the sheet's host, the panel's host outside the till, and the
 * redirect-return claim. It is mounted
 * once per bar (`BarControls`) on every size, never on the rail: it opens no page (Paul,
 * 2026-10-29), and its sheet's drawer figure is the one door to the register panel.
 */
export function CashierEntry({
	testID,
	portalHost,
	onOpenRegister,
	headless = false,
	bare = false,
}: {
	testID: string;
	/** The POS host inside the till; elsewhere the drawer layout's `scene` host on wide (beside the rail) or the root (`null`) on a phone. */
	portalHost: string | null;
	onOpenRegister?: (pane?: 'register' | 'count') => void;
	/** The sheet's host alone, no avatar: a till bar's while the desktop title bar carries the avatar. */
	headless?: boolean;
	/** The title bar's: no surface on hover or press (as `IconButton` `bare`). */
	bare?: boolean;
}) {
	const { site, wpCredentials } = useStoreSession();
	const displayName = useDocField(wpCredentials, (value) => value.display_name) as string;
	const loginUrl = site.wcpos_login_url;
	const [open, setOpen] = React.useState(false);
	const [panel, setPanel] = React.useState<{
		mounted: boolean;
		open: boolean;
		pane: 'register' | 'count';
	}>({ mounted: false, open: false, pane: 'register' });
	const openRegister =
		onOpenRegister ??
		((pane: 'register' | 'count' = 'register') => setPanel({ mounted: true, open: true, pane }));
	const focused = useIsFocused();
	const requested = useCashierSheetRequested();
	const inTill = useCurrentOrderOptional() !== undefined;
	useTillEntry(focused && inTill);
	React.useEffect(() => {
		// Outside the till, an entry leaves the request to a focused till entry, which has the order.
		if (focused && requested && (inTill || !tillEntryFocused()) && consumeCashierSheetRequest()) {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- claim the external request at commit, never in a discarded render.
			setOpen(true);
		}
	}, [focused, requested, inTill]);
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
	const sheet = (
		<>
			<UserSheet
				open={open}
				onOpenChange={setOpen}
				portalHost={portalHost}
				onOpenRegister={openRegister}
			/>
			{!onOpenRegister && panel.mounted && (
				<RegisterPanel
					open={panel.open}
					initialPane={panel.pane}
					onOpenChange={(open) => setPanel((p) => ({ ...p, open }))}
					portalHost={portalHost}
				/>
			)}
		</>
	);
	if (headless) return sheet;
	return (
		<View>
			<PressableSurface
				role="button"
				testID={testID}
				accessibilityLabel={displayName}
				// A bar's control: the control-height square with the accent wash (as `IconButton`).
				wash={bare ? 'none' : 'accent'}
				className="size-ctl items-center justify-center rounded-lg"
				onPress={() => (!inTill && tillEntryFocused() ? requestCashierSheet() : setOpen(true))}
			>
				<UserAvatar wpCredentials={wpCredentials} displayName={displayName} />
			</PressableSurface>
			{sheet}
		</View>
	);
}
