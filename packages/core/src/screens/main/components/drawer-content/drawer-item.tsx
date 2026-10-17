import * as React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { NavItem } from '@wcpos/components/nav-item';

type Props = {
	/** The label text of the item. */
	label: string | ((props: { focused?: boolean; color?: string }) => React.ReactNode);
	/** The screen's `drawerIcon`; it paints its own focused colour. */
	icon?: (props: { focused?: boolean; size?: number; color?: string }) => React.ReactNode;
	/** Whether to highlight the drawer item as active. */
	focused?: boolean;
	onPress: () => void;
	/** The screen's `drawerItemStyle` (Store health's `marginTop: 'auto'` starts the bottom group). */
	style?: StyleProp<ViewStyle>;
	testID?: string;
};

/**
 * A front-drawer item: the shared nav row at its drawer size. The wide layout's permanent rail
 * is `rail/drawer-item.tsx`, icon-only.
 */
export function DrawerItem({ label, icon, focused, onPress, style, testID }: Props) {
	const text = typeof label === 'function' ? label({ focused }) : label;
	return (
		<NavItem
			size="drawer"
			className="mx-2"
			selected={!!focused}
			icon={icon?.({ focused }) as React.ReactElement | undefined}
			// A callback's element (a styled label) renders as is: dropping it left an unnamed,
			// icon-only row (Codex and CodeRabbit review on #2622).
			label={
				typeof text === 'string' || React.isValidElement(text)
					? (text as string | React.ReactElement)
					: undefined
			}
			onPress={onPress}
			style={style}
			testID={testID}
		/>
	);
}
