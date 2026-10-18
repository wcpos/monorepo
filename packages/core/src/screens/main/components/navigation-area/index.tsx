import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Redirect, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type IconName } from '@wcpos/components/icon';
import { NavItem } from '@wcpos/components/nav-item';

import { useStoreSession } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';
import { peekRedirectLoginUrl } from '../../../../hooks/use-wcpos-auth/redirect-result';
import { requestRegisterPicker } from '../../pos/cart/register-picker-request';
import { UserSheet } from '../../pos/cart/user-sheet';
import { ManagementBar } from '../management-bar';
import { SessionHoldBanner } from '../session-hold-banner';

import type { Href } from 'expo-router';

export { AreaPage, type AreaPageMode } from './area-page';

export type NavigationAreaItem = {
	href: Extract<Href, string>;
	label: string;
	testID: string;
	icon?: IconName;
	badge?: React.ReactNode;
};

function NavigationItems({
	items,
	showChevron,
}: {
	items: NavigationAreaItem[];
	showChevron: boolean;
}) {
	const pathname = usePathname();
	const router = useRouter();

	return items.map((item) => (
		<NavItem
			key={item.href}
			testID={item.testID}
			selected={pathname === item.href}
			icon={item.icon}
			label={item.label}
			badge={item.badge}
			chevron={showChevron}
			onPress={() => router.push(item.href)}
		/>
	));
}

/**
 * The cashier sheet the bar hosted on `lg`, where the rail's avatar opens a sheet of its own:
 * this one only reopens after a redirect login, so the Add user consumer is mounted to claim
 * the one-shot result, as the bar's and the register bar's do.
 */
function RedirectReturnCashierSheet() {
	const { site } = useStoreSession();
	const [open, setOpen] = React.useState(() => peekRedirectLoginUrl() === site.wcpos_login_url);
	return (
		<UserSheet
			open={open}
			onOpenChange={setOpen}
			portalHost={null}
			onSwitchRegister={requestRegisterPicker}
		/>
	);
}

export function NavigationAreaLayout({
	items,
	indexHref,
	areaLabel,
	testID,
	screenTestID,
	barTestID,
	barNotice,
	leafPagesCarryTitle = false,
	children,
}: {
	items: NavigationAreaItem[];
	indexHref: Extract<Href, string>;
	areaLabel: string;
	testID: string;
	screenTestID?: string;
	/** The phone's page bar; `lg` has none, so the rail, list and page column sit on `bg-background`. */
	barTestID: string;
	barNotice?: React.ReactNode;
	/**
	 * The area's leaf pages render their own large heading (`AreaPage`), so on a phone the
	 * bar shows only the way back: one title, the bigger one in the page (owner, 2026-10-13).
	 * An area whose pages carry no heading keeps the bar title.
	 */
	leafPagesCarryTitle?: boolean;
	children: React.ReactNode;
}) {
	const { screenSize } = useTheme();
	const insets = useSafeAreaInsets();
	const pathname = usePathname();
	const router = useRouter();
	const current = items.find((item) => pathname === item.href);
	if (screenSize === 'sm') {
		// A leaf page (or deep link) on a narrow screen has no rail — the back
		// bar is its only in-app route to the area index and its siblings.
		return (
			<View testID={screenTestID} className="bg-background flex-1">
				<ManagementBar
					testID={barTestID}
					title={current ? (leafPagesCarryTitle ? undefined : current.label) : areaLabel}
					back={
						current
							? {
									label: areaLabel,
									onPress: () => router.navigate(indexHref),
									testID: `${testID}-back`,
								}
							: undefined
					}
				/>
				{barNotice}
				{children}
			</View>
		);
	}

	// No bar on `lg` (owner, 2026-10-18): the page's own heading (`AreaPage`) is the title, the
	// rail carries the avatar, and these pages need neither the bell nor the offline badge (his
	// call: the POS and the list pages keep theirs). What the bar held besides stays: the top
	// inset, the held-session banner, the upgrade notice and the redirect-login sheet.
	return (
		<View className="bg-background flex-1" style={{ paddingTop: insets.top }}>
			<SessionHoldBanner />
			{barNotice}
			<View testID={testID} className="flex-1 flex-row">
				<View
					testID={`${testID}-rail`}
					className="border-border/50 bg-background w-56 shrink-0 gap-0.5 border-r p-3"
				>
					<NavigationItems items={items} showChevron={false} />
				</View>
				{/* The page ground, like the rail: each page is one card on it (`AreaPage`), so the
				    rail's selected row (`bg-card`) and the page card read as the same surface. */}
				<View testID={screenTestID} className="bg-background min-w-0 flex-1">
					{children}
				</View>
			</View>
			<RedirectReturnCashierSheet />
		</View>
	);
}

export function NavigationAreaIndex({
	items,
	defaultHref,
	testID,
}: {
	items: NavigationAreaItem[];
	defaultHref: Extract<Href, string>;
	testID: string;
}) {
	const { screenSize } = useTheme();

	if (screenSize !== 'sm') {
		return <Redirect href={defaultHref} />;
	}

	return (
		<ScrollView testID={testID} className="bg-background flex-1">
			<View className="gap-1 p-4">
				<NavigationItems items={items} showChevron />
			</View>
		</ScrollView>
	);
}
