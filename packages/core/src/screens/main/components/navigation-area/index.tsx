import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Redirect, usePathname, useRouter } from 'expo-router';

import { type IconName } from '@wcpos/components/icon';
import { NavItem } from '@wcpos/components/nav-item';

import { useTheme } from '../../../../contexts/theme';
import { ManagementBar } from '../management-bar';

import type { Href } from 'expo-router';

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
	/** Every area is on the page bar, so its rail and list sit on `bg-background`. */
	barTestID: string;
	barNotice?: React.ReactNode;
	/**
	 * The area's leaf pages render their own large heading (`SettingsPage`), so on a phone the
	 * bar shows only the way back: one title, the bigger one in the page (owner, 2026-10-13).
	 * An area whose pages carry no heading yet (Health) keeps the bar title until they do.
	 */
	leafPagesCarryTitle?: boolean;
	children: React.ReactNode;
}) {
	const { screenSize } = useTheme();
	const pathname = usePathname();
	const router = useRouter();
	const current = items.find((item) => pathname === item.href);
	const phoneLeaf = screenSize === 'sm' && current;
	const bar = (
		<>
			<ManagementBar
				testID={barTestID}
				title={phoneLeaf ? (leafPagesCarryTitle ? undefined : current.label) : areaLabel}
				back={
					phoneLeaf
						? {
								label: areaLabel,
								onPress: () => router.navigate(indexHref),
								testID: `${testID}-back`,
							}
						: undefined
				}
			/>
			{barNotice}
		</>
	);

	if (screenSize === 'sm') {
		// A leaf page (or deep link) on a narrow screen has no rail — the back
		// bar is its only in-app route to the area index and its siblings.
		return (
			<View testID={screenTestID} className="bg-background flex-1">
				{bar}
				{children}
			</View>
		);
	}

	const content = (
		<View testID={testID} className="flex-1 flex-row">
			<View
				testID={`${testID}-rail`}
				className="border-border/50 bg-background w-56 shrink-0 gap-0.5 border-r p-3"
			>
				<NavigationItems items={items} showChevron={false} />
			</View>
			<View testID={screenTestID} className="bg-card min-w-0 flex-1">
				{children}
			</View>
		</View>
	);
	return (
		<View className="flex-1">
			{bar}
			{content}
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
