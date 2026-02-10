import * as React from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { SystemBars } from 'react-native-edge-to-edge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';

import { HeaderLeft as Left } from './left';
import { HeaderRight as Right } from './right';
import { HeaderTitle } from './title';
import { UpgradeNotice } from './upgrade-notice';
import { useAppState } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';

import type { DrawerHeaderProps } from '@react-navigation/drawer';

interface Props {
	options: DrawerHeaderProps['options'];
	showUpgrade: boolean;
	setShowUpgrade: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Custom flex-based header layout with measure-based centering.
 *
 * The title is centered by measuring left/right button widths and applying
 * compensating padding. This ensures the title appears visually centered
 * in the viewport regardless of asymmetric button widths.
 *
 * For long titles, the text truncates with ellipsis while using all
 * available space between the buttons.
 */
export function Header({ options, showUpgrade, setShowUpgrade }: Props) {
	const insets = useSafeAreaInsets();
	const { store } = useAppState();
	const storeName = useObservableState(store.name$, store.name);
	const { screenSize } = useTheme();

	// Track widths for centering calculation
	const [leftWidth, setLeftWidth] = React.useState(0);
	const [rightWidth, setRightWidth] = React.useState(0);
	const [titleContainerWidth, setTitleContainerWidth] = React.useState(0);
	const [titleTextWidth, setTitleTextWidth] = React.useState(0);

	// Get theme-aware colors - header uses sidebar color to match drawer
	const [sidebarColor, sidebarBorderColor] = useCSSVariable([
		'--color-sidebar',
		'--color-sidebar-border',
	]) as string[];

	const isSmallScreen = screenSize === 'sm';
	const title = `${options.title} - ${storeName}`;

	// Calculate centering offset: positive means right is wider, negative means left is wider
	// Only apply centering when the title actually fits - otherwise use all available space
	const rawOffset = rightWidth - leftWidth;
	const availableWithCentering = titleContainerWidth - Math.abs(rawOffset);
	const titleFits = titleTextWidth > 0 && titleTextWidth < availableWithCentering;
	const centeringOffset = isSmallScreen || !titleFits ? 0 : rawOffset;

	const handleLeftLayout = React.useCallback((event: LayoutChangeEvent) => {
		setLeftWidth(event.nativeEvent.layout.width);
	}, []);

	const handleRightLayout = React.useCallback((event: LayoutChangeEvent) => {
		setRightWidth(event.nativeEvent.layout.width);
	}, []);

	const handleTitleContainerLayout = React.useCallback((event: LayoutChangeEvent) => {
		setTitleContainerWidth(event.nativeEvent.layout.width);
	}, []);

	const handleIntrinsicWidth = React.useCallback((width: number) => {
		setTitleTextWidth(width);
	}, []);

	return (
		<ErrorBoundary>
			<View id="titlebar">
				<View
					style={{
						backgroundColor: sidebarColor,
						paddingTop: insets.top,
						borderBottomWidth: 1,
						borderBottomColor: sidebarBorderColor,
					}}
				>
					<HStack className="h-10 items-center">
						{/* Left section - measured for centering calculation */}
						<View onLayout={handleLeftLayout}>
							<Left />
						</View>

						{/* Title section - flex to fill remaining space, with centering offset */}
						<View
							className="min-w-0 flex-1"
							onLayout={handleTitleContainerLayout}
							style={{
								// Apply padding to shift title for true centering
								// If right is wider: add left padding to push title right
								// If left is wider: add right padding to push title left
								// Only applied when title fits (doesn't need truncation)
								paddingLeft: Math.max(0, centeringOffset),
								paddingRight: Math.max(0, -centeringOffset),
							}}
						>
							<HeaderTitle
								centered={!isSmallScreen && titleFits}
								onIntrinsicWidth={handleIntrinsicWidth}
							>
								{title}
							</HeaderTitle>
						</View>

						{/* Right section - measured for centering calculation */}
						<View onLayout={handleRightLayout}>
							<Right />
						</View>
					</HStack>
				</View>
				{/*
				 * Status bar uses 'light' style (white icons) because sidebar is always dark
				 * in all themes. This is handled by react-native-edge-to-edge which is
				 * the recommended approach for Expo SDK 54+ edge-to-edge displays.
				 */}
				<SystemBars style="light" />
				{showUpgrade && <UpgradeNotice setShowUpgrade={setShowUpgrade} />}
			</View>
		</ErrorBoundary>
	);
}
