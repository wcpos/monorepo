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

/**
 * The surface the area sits on. An area that opted into the page bar (`barTestID`) is on
 * `bg-background`, so a selected row lifts onto `bg-card`; an area that did not (Health, until
 * its own switch) is still on `bg-card`, where that lift is invisible, so it keeps the tinted
 * row it had. The index route reads it too, so both surfaces stay consistent per area.
 */
const NavigationSurfaceContext = React.createContext<'background' | 'card'>('card');

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
	const surface = React.useContext(NavigationSurfaceContext);
	const lifted = surface === 'background';

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
				// `data-surface` on web: Uniwind compiles the classes away, so tests read the surface here.
				{...({ dataSet: { surface } } as object)}
				className={cn(
					'h-10 w-full flex-row items-center gap-3 rounded-md px-3',
					lifted ? 'active:bg-card' : 'active:bg-primary/10',
					pointer === 'fine' && (lifted ? 'web:hover:bg-card' : 'web:hover:bg-primary/10'),
					selected && (lifted ? 'bg-card' : 'bg-primary/10')
				)}
			>
				{item.icon ? (
					<Icon
						name={item.icon}
						size="sm"
						className={
							selected ? (lifted ? 'text-foreground' : 'text-primary') : 'text-muted-foreground'
						}
					/>
				) : null}
				<Text
					className={cn(
						'flex-1 text-sm',
						selected
							? lifted
								? 'text-foreground'
								: 'text-primary font-semibold'
							: 'text-muted-foreground'
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

	const surface = barTestID ? 'background' : 'card';

	if (screenSize === 'sm') {
		// A leaf page (or deep link) on a narrow screen has no rail — the back
		// bar is its only in-app route to the area index and its siblings.
		return (
			<NavigationSurfaceContext.Provider value={surface}>
				<View
					testID={screenTestID}
					className={cn('flex-1', barTestID ? 'bg-background' : 'bg-card')}
				>
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
			</NavigationSurfaceContext.Provider>
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
	return (
		<NavigationSurfaceContext.Provider value={surface}>
			{barTestID ? (
				<View className="flex-1">
					{bar}
					{content}
				</View>
			) : (
				content
			)}
		</NavigationSurfaceContext.Provider>
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
	const surface = React.useContext(NavigationSurfaceContext);

	if (screenSize !== 'sm') {
		return <Redirect href={defaultHref} />;
	}

	return (
		<ScrollView
			testID={testID}
			className={cn('flex-1', surface === 'background' ? 'bg-background' : 'bg-card')}
		>
			<View className="gap-1 p-4">
				<NavigationItems items={items} showChevron />
			</View>
		</ScrollView>
	);
}
