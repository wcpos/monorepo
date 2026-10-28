import * as React from 'react';
import { StyleSheet, View } from 'react-native';

// SDK 56: expo-router vendors react-navigation; @react-navigation/drawer is no longer a dependency.
import { DrawerContentScrollView, getDrawerStatusFromState } from 'expo-router/drawer';
import { CommonActions, DrawerActions } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavItem } from '@wcpos/components/nav-item';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { Platform } from '@wcpos/utils/platform';
import type { IconName } from '@wcpos/components/icon';

import { DrawerPanelVisibilityReporter, useDrawerPanelHidden } from './panel-visibility';
import { RailAvatar } from './rail';
import { Version } from './version';
import { NotificationBell } from '../notification-bell/notification-bell';

import type { DrawerContentComponentProps } from 'expo-router/drawer';

type Props = DrawerContentComponentProps & {
	/** `rail`: the wide layout's permanent icon column; `front`: the drawer that slides over. */
	presentation: 'rail' | 'front';
	/** Each route's icon by route name; the item paints its tint from its selected state. */
	icons: Partial<Record<string, IconName>>;
	/** Drawn on a route's icon by route name (Store health's unread errors). */
	badges?: Partial<Record<string, React.ReactNode>>;
};

/**
 * The drawer's body in both presentations: one item per route (`NavItem`, labelled in the front
 * drawer, an icon-only square with a web tooltip on the rail), the navigate-or-close press, the
 * top group and the bottom group the navigator's `marginTop: 'auto'` starts, the panel's
 * visibility report, its assistive-tech hiding, the insets and the panel testID.
 *
 * NOTE ON HOOKS: the navigator calls `drawerContent(props)` inside `Drawer`'s own render, so a
 * hook here can only read context from providers ABOVE `Drawer`, never the drawer-owned ones
 * (`DrawerProgressContext`, `DrawerGestureContext`). Anything that needs those has to be a
 * rendered element instead. `useSafeAreaInsets` is fine because its provider is far above.
 */
export function DrawerContent({ presentation, icons, badges, ...props }: Props) {
	const rail = presentation === 'rail';
	const { state, navigation, descriptors } = props;
	const insets = useSafeAreaInsets();

	// The drawer's open/closed status only exists on the navigator's state. Report it upward so
	// the layout can take a settled-closed panel out of layout entirely (`panel-visibility.tsx`).
	const status = getDrawerStatusFromState(state, 'closed');

	// A settled-closed panel is out of layout but stays mounted, and on Android the accessibility
	// tree kept reporting its items with their last bounds after a heavy screen mount (Maestro run
	// 33740223026: `drawer-item-pos` "visible" with nothing drawn). Never the rail: it is always on
	// screen, yet its navigator state says "closed", so the flag alone would hide it all session.
	const panelHidden = useDrawerPanelHidden();
	const hideFromAssistiveTech = !rail && panelHidden;
	const focusedKey = state.routes[state.index]?.key;

	// The navigator's auto margin marks the start of the bottom group.
	const bottomIndex = state.routes.findIndex(
		(route) =>
			StyleSheet.flatten(descriptors[route.key]?.options.drawerItemStyle)?.marginTop === 'auto'
	);
	const split = bottomIndex < 0 ? state.routes.length : bottomIndex;
	const groups = [state.routes.slice(0, split), state.routes.slice(split)];

	const renderItem = (route: (typeof state.routes)[number]) => {
		const focused = route.key === focusedKey;
		const label = descriptors[route.key]?.options.title ?? route.name;
		const badge = badges?.[route.name];
		const item = (
			<NavItem
				size="drawer"
				selected={focused}
				icon={icons[route.name]}
				label={rail ? undefined : label}
				accessibilityLabel={label}
				className={rail ? 'w-12' : undefined}
				testID={`drawer-item-${route.name.replace(/[()]/g, '')}`}
				onPress={() =>
					navigation.dispatch({
						...(focused
							? DrawerActions.closeDrawer()
							: CommonActions.navigate({ name: route.name, merge: true })),
						target: state.key,
					})
				}
			/>
		);
		return (
			<View key={route.key} className={rail ? undefined : 'mx-2'}>
				{rail && Platform.OS === 'web' ? (
					<Tooltip>
						<TooltipTrigger asChild>{item}</TooltipTrigger>
						<TooltipContent side="right">
							<Text>{label}</Text>
						</TooltipContent>
					</Tooltip>
				) : (
					item
				)}
				{/* Over the item's icon box: `px-3` in, centred in its 48 (`size-6` at `xl`). */}
				{badge ? (
					<View pointerEvents="none" className="absolute top-3 left-3 size-6">
						{badge}
					</View>
				) : null}
			</View>
		);
	};

	return (
		<>
			<DrawerPanelVisibilityReporter status={status === 'open' ? 'open' : 'closed'} />
			<DrawerContentScrollView
				{...props}
				// No `className` here: the vendored view spreads it onto a ScrollView Uniwind never
				// saw, so it is dropped. The layout owns the width and colour through `drawerStyle`.
				// The E2E flows tell the always-on rail (nothing to close) from a front drawer left
				// open (closed through the scrim before a flow starts) by this testID.
				testID={rail ? 'drawer-panel-permanent' : 'drawer-panel'}
				importantForAccessibility={hideFromAssistiveTech ? 'no-hide-descendants' : 'auto'}
				accessibilityElementsHidden={hideFromAssistiveTech}
				contentContainerStyle={{
					paddingTop: insets.top,
					paddingBottom: insets.bottom,
					paddingLeft: 0,
					paddingRight: 0,
					paddingStart: 0,
					paddingEnd: 0,
					alignItems: rail ? 'center' : undefined,
					justifyContent: 'flex-start',
					// flexGrow (not height: '100%') so the bottom group's auto margin still anchors when
					// content fits, while overflowing items stay scrollable on short viewports (#1425).
					flexGrow: 1,
				}}
			>
				{rail && <RailAvatar />}
				{groups.map((routes, group) => (
					<View key={group} className={group === 1 ? 'mt-auto' : undefined}>
						{/* The rail's `gap-2` is the dense-strip gutter between its squares. */}
						<View
							className={rail ? 'gap-2' : undefined}
							testID={group === 0 ? 'drawer-top-group' : 'drawer-bottom-group'}
						>
							{routes.map(renderItem)}
						</View>
						{group === 1 && !rail && <NotificationBell showLabel />}
						{group === 1 && <Version />}
					</View>
				))}
			</DrawerContentScrollView>
		</>
	);
}
