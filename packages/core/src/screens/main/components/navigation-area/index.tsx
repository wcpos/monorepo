import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Redirect, usePathname, useRouter } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon, type IconName } from '@wcpos/components/icon';
import { usePointer } from '@wcpos/components/lib/device';
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
	const pointer = usePointer();

	return items.map((item) => {
		const selected = pathname === item.href;

		return (
			<Pressable
				key={item.href}
				accessibilityRole="button"
				testID={item.testID}
				onPress={() => router.push(item.href)}
				accessibilityState={{ selected }}
				aria-selected={selected}
				className={cn(
					'active:bg-card h-10 w-full flex-row items-center gap-3 rounded-md px-3',
					pointer === 'fine' && 'web:hover:bg-card',
					selected && 'bg-card'
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
					className={cn('flex-1 text-sm', selected ? 'text-foreground' : 'text-muted-foreground')}
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
	barNotice,
	children,
}: {
	items: NavigationAreaItem[];
	indexHref: Extract<Href, string>;
	areaLabel: string;
	testID: string;
	screenTestID?: string;
	barTestID?: string;
	barNotice?: React.ReactNode;
	children: React.ReactNode;
}) {
	const { screenSize } = useTheme();
	const pathname = usePathname();
	const router = useRouter();
	const current = items.find((item) => pathname === item.href);
	const phoneLeaf = screenSize === 'sm' && current;
	const bar = barTestID ? (
		<>
			<ManagementBar
				testID={barTestID}
				title={phoneLeaf ? current.label : areaLabel}
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
	) : null;

	if (screenSize === 'sm') {
		// A leaf page (or deep link) on a narrow screen has no rail — the back
		// bar is its only in-app route to the area index and its siblings.
		return (
			<View testID={screenTestID} className={cn('flex-1', barTestID ? 'bg-background' : 'bg-card')}>
				{bar}
				{current && !barTestID ? (
					<HStack
						testID={`${testID}-back`}
						className="border-border/50 bg-card h-12 items-center gap-2 border-b px-1"
					>
						<Button variant="link" onPress={() => router.navigate(indexHref)}>
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

	const content = (
		<View testID={testID} className="flex-1 flex-row">
			<View
				testID={`${testID}-rail`}
				className={cn(
					'border-border/50 w-56 shrink-0 gap-0.5 border-r p-3',
					barTestID ? 'bg-background' : 'bg-card'
				)}
			>
				<NavigationItems items={items} showChevron={false} />
			</View>
			<View testID={screenTestID} className="bg-card min-w-0 flex-1">
				{children}
			</View>
		</View>
	);
	return barTestID ? (
		<View className="flex-1">
			{bar}
			{content}
		</View>
	) : (
		content
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
		<ScrollView testID={testID} className="bg-card flex-1">
			<View className="gap-1 p-4">
				<NavigationItems items={items} showChevron />
			</View>
		</ScrollView>
	);
}
