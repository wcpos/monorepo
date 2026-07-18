import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Redirect, usePathname, useRouter } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { cn } from '@wcpos/components/lib/utils';

import { useTheme } from '../../../../contexts/theme';

import type { Href } from 'expo-router';

export type NavigationAreaItem = {
	href: Extract<Href, string>;
	label: string;
	testID: string;
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

		return (
			<Button
				key={item.href}
				variant="ghost"
				testID={item.testID}
				onPress={() => router.push(item.href)}
				accessibilityState={{ selected }}
				className={cn('h-12 w-full justify-start px-3', selected && 'bg-muted web:hover:bg-muted')}
			>
				<HStack className="w-full flex-1 items-center justify-between gap-3">
					<ButtonText className={cn('flex-1', selected && 'text-primary font-semibold')}>
						{item.label}
					</ButtonText>
					{item.badge ? <View className="relative h-5 w-5">{item.badge}</View> : null}
					{showChevron ? <Icon name="chevronRight" className="text-muted-foreground" /> : null}
				</HStack>
			</Button>
		);
	});
}

export function NavigationAreaLayout({
	items,
	indexHref,
	areaLabel,
	testID,
	screenTestID,
	children,
}: {
	items: NavigationAreaItem[];
	indexHref: Extract<Href, string>;
	areaLabel: string;
	testID: string;
	screenTestID?: string;
	children: React.ReactNode;
}) {
	const { screenSize } = useTheme();
	const pathname = usePathname();
	const router = useRouter();

	if (screenSize === 'sm') {
		// A leaf page (or deep link) on a narrow screen has no rail — the back
		// bar is its only in-app route to the area index and its siblings.
		const current = items.find((item) => pathname === item.href);
		return (
			<View testID={screenTestID} className="flex-1">
				{current ? (
					<HStack
						testID={`${testID}-back`}
						className="border-border bg-card h-12 items-center gap-2 border-b px-1"
					>
						<Button variant="ghost" onPress={() => router.navigate(indexHref)}>
							<HStack className="items-center gap-1">
								<Icon name="chevronLeft" className="text-primary" />
								<ButtonText className="text-primary">{areaLabel}</ButtonText>
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
		<View testID={testID} className="flex-1 flex-row">
			<View
				testID={`${testID}-rail`}
				className="border-border bg-card w-56 shrink-0 gap-1 border-r p-3"
			>
				<NavigationItems items={items} showChevron={false} />
			</View>
			<View testID={screenTestID} className="min-w-0 flex-1">
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
		<ScrollView testID={testID} className="flex-1">
			<View className="gap-2 p-4">
				<NavigationItems items={items} showChevron />
			</View>
		</ScrollView>
	);
}
