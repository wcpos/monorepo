import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Link, Stack, useLocalSearchParams, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';

import { stories as button } from '@wcpos/components/button/gallery';
import { stories as combobox } from '@wcpos/components/combobox/gallery';
import { stories as emptyState } from '@wcpos/components/empty-state/gallery';
import { stories as notice } from '@wcpos/components/notice/gallery';
import { stories as skeleton } from '@wcpos/components/skeleton/gallery';
import { stories as icon } from '@wcpos/components/icon/gallery';
import { stories as input } from '@wcpos/components/input/gallery';
import { PortalHost } from '@wcpos/components/portal';
import { stories as select } from '@wcpos/components/select/gallery';
import { Text } from '@wcpos/components/text';
import { stories as text } from '@wcpos/components/text/gallery';

import NotFound from '../../app/+not-found';
import { GalleryCells, type Story } from './cells';

const registry: Record<string, Story[]> = {
	input,
	button,
	select,
	combobox,
	text,
	icon,
	skeleton,
	'empty-state': emptyState,
	notice,
};

function GalleryPage({ children }: React.PropsWithChildren) {
	const { theme } = useLocalSearchParams<{ theme?: string }>();
	// Sync the URL's external theme selection before painting the cells.
	React.useLayoutEffect(() => {
		Uniwind.setTheme(theme === 'dark' ? 'dark' : 'light');
	}, [theme]);
	return (
		<ScrollView className="bg-background flex-1" contentContainerClassName="p-6">
			{children}
			<PortalHost />
		</ScrollView>
	);
}

export function GalleryIndex() {
	return (
		<GalleryPage>
			{Object.entries(registry)
				.filter(([, stories]) => stories.length)
				.map(([name]) => (
					<Link
						key={name}
						href={{ pathname: '/gallery/[component]', params: { component: name } }}
						testID={`gallery-link-${name}`}
						{...{ dataSet: { galleryComponent: name } }}
						className="p-3"
					>
						<Text>{name}</Text>
					</Link>
				))}
		</GalleryPage>
	);
}

export function GalleryComponent() {
	const { component, cell } = useLocalSearchParams<{ component: string; cell?: string }>();
	const stories = Object.hasOwn(registry, component) ? registry[component] : undefined;
	if (!stories?.length) return <NotFound />;
	return (
		<GalleryPage>
			<View className={cell ? 'w-full' : 'web:grid web:grid-cols-2 gap-4'}>
				<GalleryCells component={component} stories={stories} cell={cell} />
			</View>
		</GalleryPage>
	);
}

export const IS_GALLERY_BUILD = true;

/**
 * The gallery build's root: the developer route gets a bare stack (no store
 * hydration, no sync, no merchant toasts); every other route gets the merchant root.
 */
export function GalleryRootLayout({ merchant: Merchant }: { merchant: React.ComponentType }) {
	const segments = useSegments();
	if (segments[0] !== '(gallery)') return <Merchant />;
	return (
		<SafeAreaProvider>
			<GestureHandlerRootView style={{ flex: 1 }}>
				<Stack screenOptions={{ headerShown: false }} />
			</GestureHandlerRootView>
		</SafeAreaProvider>
	);
}
