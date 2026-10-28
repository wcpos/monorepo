import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Redirect, usePathname, useRouter } from 'expo-router';

import { EdgeSurface } from '@wcpos/components/edge-surface';
import { useIsPhone } from '@wcpos/components/lib/device';
import { type IconName } from '@wcpos/components/icon';
import { NavItem } from '@wcpos/components/nav-item';
import { cn } from '@wcpos/components/lib/utils';
import { useGround } from '@wcpos/components/lib/ground';

import { ManagementBar } from '../management-bar';
import { SessionHoldBanner, useSessionHeld } from '../session-hold-banner';

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

const TOP = ['top'] as const;

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
	const phone = useIsPhone();
	const ground = useGround();
	const pathname = usePathname();
	const router = useRouter();
	const current = items.find((item) => pathname === item.href);
	const held = useSessionHeld();
	if (phone) {
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
	// inset, the held-session banner and the upgrade notice; the rail's cashier entry claims a
	// redirect login.
	return (
		<EdgeSurface edges={TOP} className="bg-background flex-1">
			<SessionHoldBanner />
			{/* First row of the column: flush with the top it pads; after the hold banner it is the
			    next row, one page gutter down (CODING_STANDARDS § Design, Gutters). */}
			{barNotice != null && <View className={held ? ground.mt : undefined}>{barNotice}</View>}
			<View testID={testID} className="flex-1 flex-row">
				<View
					testID={`${testID}-rail`}
					className={cn('border-border/50 bg-background w-56 shrink-0 gap-0.5 border-r', ground.p)}
				>
					<NavigationItems items={items} showChevron={false} />
				</View>
				{/* The page ground, like the rail: each page is one card on it (`AreaPage`), so the
				    rail's selected row (`bg-card`) and the page card read as the same surface. */}
				<View testID={screenTestID} className="bg-background min-w-0 flex-1">
					{children}
				</View>
			</View>
		</EdgeSurface>
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
	const phone = useIsPhone();
	const ground = useGround();

	if (!phone) {
		return <Redirect href={defaultHref} />;
	}

	return (
		<ScrollView testID={testID} className="bg-background flex-1">
			<View className={cn('gap-1', ground.p)}>
				<NavigationItems items={items} showChevron />
			</View>
		</ScrollView>
	);
}
