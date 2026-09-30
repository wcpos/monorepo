import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Redirect, usePathname, useRouter } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon, type IconName } from '@wcpos/components/icon';
import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';

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

	return items.map((item) => {
		const selected = pathname === item.href;

		// Quiet rows; the selected one takes the lg rail's own selected surface
		// (`drawer-content/v2/drawer-item.tsx`) so the two rails agree. The phone
		// index is touch-only, so its rows keep the 44 pt control height.
		return (
			<Pressable
				key={item.href}
				testID={item.testID}
				onPress={() => router.push(item.href)}
				accessibilityRole="button"
				accessibilityState={{ selected }}
				aria-selected={selected}
				className={cn(
					'active:bg-card web:hover:bg-card/60 flex-row items-center gap-3 rounded-md px-3',
					showChevron ? 'h-ctl' : 'h-10',
					selected && 'bg-card web:hover:bg-card'
				)}
			>
				{item.icon ? (
					<Icon
						name={item.icon}
						size="sm"
						className={selected ? 'text-foreground' : 'text-muted-foreground'}
					/>
				) : null}
				<Text
					className={cn(
						'flex-1 text-sm',
						selected ? 'text-foreground font-medium' : 'text-muted-foreground'
					)}
				>
					{item.label}
				</Text>
				{item.badge ? <View className="relative h-5 w-5">{item.badge}</View> : null}
				{showChevron ? <Icon name="chevronRight" className="text-muted-foreground" /> : null}
			</Pressable>
		);
	});
}

export function NavigationAreaLayout({
	items,
	indexHref,
	areaLabel,
	testID,
	screenTestID,
	barTestID,
	banner,
	children,
}: {
	items: NavigationAreaItem[];
	indexHref: Extract<Href, string>;
	areaLabel: string;
	testID: string;
	screenTestID?: string;
	/**
	 * Opt-in: the area sits under the shared page bar, which then carries the
	 * phone leaf's title and its crumb back to the index. Absent (Health, until
	 * its own switch), the layout keeps its own back bar under the drawer header.
	 */
	barTestID?: string;
	/** Rendered under the bar (the upgrade strip). */
	banner?: React.ReactNode;
	children: React.ReactNode;
}) {
	const { screenSize } = useTheme();
	const pathname = usePathname();
	const router = useRouter();
	const current = items.find((item) => pathname === item.href);
	const toIndex = () => router.navigate(indexHref);

	if (barTestID) {
		// On a phone the leaf's bar reads the page's title with the area as its
		// crumb; the crumb is the route to the index, deep links included.
		const leaf = screenSize === 'sm' && current;
		return (
			<View className="bg-background flex-1">
				<ManagementBar
					title={leaf ? current.label : areaLabel}
					testID={barTestID}
					back={leaf ? { label: areaLabel, onPress: toIndex, testID: `${testID}-back` } : undefined}
				/>
				{banner}
				{screenSize === 'sm' ? (
					<View testID={screenTestID} className="bg-background flex-1">
						{children}
					</View>
				) : (
					<AreaRail items={items} testID={testID} screenTestID={screenTestID} barred={!!barTestID}>
						{children}
					</AreaRail>
				)}
			</View>
		);
	}

	if (screenSize === 'sm') {
		// A leaf page (or deep link) on a narrow screen has no rail — the back
		// bar is its only in-app route to the area index and its siblings.
		return (
			<View testID={screenTestID} className="bg-card flex-1">
				{current ? (
					<HStack
						testID={`${testID}-back`}
						className="border-border/50 bg-card h-12 items-center gap-2 border-b px-1"
					>
						<Button variant="link" onPress={toIndex}>
							<HStack className="items-center gap-1">
								<Icon name="chevronLeft" className="text-primary" />
								<ButtonText>{areaLabel}</ButtonText>
							</HStack>
						</Button>
						<ButtonText className="font-semibold">{current.label}</ButtonText>
					</HStack>
				) : null}
				{children}
			</View>
		);
	}

	return (
		<AreaRail items={items} testID={testID} screenTestID={screenTestID} barred={!!barTestID}>
			{children}
		</AreaRail>
	);
}

function AreaRail({
	items,
	testID,
	screenTestID,
	barred,
	children,
}: {
	items: NavigationAreaItem[];
	testID: string;
	screenTestID?: string;
	barred: boolean;
	children: React.ReactNode;
}) {
	return (
		<View testID={testID} className="flex-1 flex-row">
			<View
				testID={`${testID}-rail`}
				className="border-border bg-background w-56 shrink-0 gap-0.5 border-r p-3"
			>
				<NavigationItems items={items} showChevron={false} />
			</View>
			<View
				testID={screenTestID}
				className={cn('min-w-0 flex-1', barred ? 'bg-background' : 'bg-card')}
			>
				{children}
			</View>
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
