import * as React from 'react';
import { Pressable } from 'react-native';

import { useSpacingUnit } from '@wcpos/components/lib/use-spacing-unit';
import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../../../contexts/app-state';
import { UserAvatar } from '../../user-avatar';
import { requestRegisterPicker } from '../../../pos/cart/register-picker-request';
import { UserSheet } from '../../../pos/cart/user-sheet';

/**
 * The rail's width in spacing units: its `size-12` item plus `2` (8 at Regular, the dense-strip
 * gutter of CODING_STANDARDS § Design) each side. The width follows from the items and the
 * gutter, not the other way round (owner, 2026-10-18; at 56 the active square touched the sides).
 */
const RAIL_WIDTH_UNITS = 12 + 2 * 2;

/**
 * The rail's width at the active spacing step: 56 Compact, 64 Regular, 80 Spacious. The drawer
 * layout (`apps/main/app/(app)/(drawer)/_layout.tsx`) sets it as the permanent drawer's
 * `drawerStyle.width`: a `w-16` class on `DrawerContentScrollView` never reaches the vendored
 * `ScrollView`, which is how the rail rendered 48 wide with the active square on its edge until
 * 2026-10-20.
 */
export function useRailWidth(): number {
	return RAIL_WIDTH_UNITS * useSpacingUnit();
}

/** The rail's cashier avatar, opening the cashier sheet on the root host. */
export function RailAvatar() {
	const { wpCredentials } = useStoreSession();
	const displayName = useDocField(wpCredentials, (value) => value.display_name) as string;
	const [open, setOpen] = React.useState(false);
	return (
		<>
			<Pressable
				className="active:bg-card size-12 items-center justify-center"
				testID="register-bar-avatar"
				accessibilityRole="button"
				accessibilityLabel={displayName}
				onPress={() => setOpen(true)}
			>
				<UserAvatar wpCredentials={wpCredentials} displayName={displayName} />
			</Pressable>
			<UserSheet
				open={open}
				onOpenChange={setOpen}
				portalHost={null}
				onSwitchRegister={requestRegisterPicker}
			/>
		</>
	);
}
