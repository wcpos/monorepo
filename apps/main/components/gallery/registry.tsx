import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Link, Stack, useLocalSearchParams, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';

import { stories as label } from '@wcpos/components/label/gallery';
import { stories as form } from '@wcpos/components/form/gallery';
import { stories as calendar } from '@wcpos/components/calendar/gallery';
import { stories as numpad } from '@wcpos/components/numpad/gallery';
import { stories as treeCombobox } from '@wcpos/components/tree-combobox/gallery';
import { stories as slider } from '@wcpos/components/slider/gallery';
import { stories as switchStories } from '@wcpos/components/switch/gallery';
import { stories as radioGroup } from '@wcpos/components/radio-group/gallery';
import { stories as checkbox } from '@wcpos/components/checkbox/gallery';
import { stories as textarea } from '@wcpos/components/textarea/gallery';
import { stories as iconButton } from '@wcpos/components/icon-button/gallery';
import { stories as breadcrumb } from '@wcpos/components/breadcrumb/gallery';
import { stories as button } from '@wcpos/components/button/gallery';
import { stories as chip } from '@wcpos/components/chip/gallery';
import { stories as keypad } from '@wcpos/components/keypad/gallery';
import { stories as segmentedControl } from '@wcpos/components/segmented-control/gallery';
import { stories as combobox } from '@wcpos/components/combobox/gallery';
import { stories as emptyState } from '@wcpos/components/empty-state/gallery';
import { stories as notice } from '@wcpos/components/notice/gallery';
import { stories as skeleton } from '@wcpos/components/skeleton/gallery';
import { stories as icon } from '@wcpos/components/icon/gallery';
import { stories as input } from '@wcpos/components/input/gallery';
import { stories as pageBar } from '@wcpos/components/page-bar/gallery';
import { PortalHost } from '@wcpos/components/portal';
import { stories as select } from '@wcpos/components/select/gallery';
import { Text } from '@wcpos/components/text';
import { stories as text } from '@wcpos/components/text/gallery';
import { stories as dialogV2 } from '@wcpos/components/v2/dialog/gallery';
import { stories as badge } from '@wcpos/components/badge/gallery';
import { stories as avatar } from '@wcpos/components/avatar/gallery';
import { stories as loader } from '@wcpos/components/loader/gallery';
import { stories as progress } from '@wcpos/components/progress/gallery';
import { stories as sortIcon } from '@wcpos/components/sort-icon/gallery';
import { stories as docsLink } from '@wcpos/components/docs-link/gallery';
import { stories as card } from '@wcpos/components/card/gallery';

import NotFound from '../../app/+not-found';
import { GalleryCells, type Story } from './cells';

const registry: Record<string, Story[]> = {
	badge,
	avatar,
	loader,
	progress,
	'sort-icon': sortIcon,
	'docs-link': docsLink,
	card,
	label,
	form,
	calendar,
	numpad,
	'tree-combobox': treeCombobox,
	slider,
	switch: switchStories,
	'radio-group': radioGroup,
	checkbox,
	textarea,
	'icon-button': iconButton,
	chip,
	keypad,
	'segmented-control': segmentedControl,
	input,
	button,
	select,
	combobox,
	text,
	icon,
	skeleton,
	'empty-state': emptyState,
	notice,
	breadcrumb,
	'page-bar': pageBar,
	'v2-dialog': dialogV2,
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
