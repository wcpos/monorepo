import * as React from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { SystemBars } from 'react-native-edge-to-edge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';

import { HeaderLeft as Left } from './left';
import { HeaderRight as Right } from './right';
import { HeaderTitle } from './title';
import { UpgradeNotice } from './upgrade-notice';
import { useAppState } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';

import type { DrawerHeaderProps } from 'expo-router/build/react-navigation/drawer';

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

	const isSmallScreen = screenSize === 'sm';
	const isLargeScreen = screenSize === 'lg';
	const title = `${options.title} - ${storeName}`;

	// Large screens render no left button, so the true left width there is zero
	// regardless of what was measured before a resize; deriving it (instead of
	// resetting state) keeps the zero-report filter below unconditional.
	const effectiveLeftWidth = isLargeScreen ? 0 : leftWidth;

	// Calculate centering offset: positive means right is wider, negative means left is wider
	// Only apply centering when the title actually fits - otherwise use all available space
	const rawOffset = rightWidth - effectiveLeftWidth;
	const availableWithCentering = titleContainerWidth - Math.abs(rawOffset);
	const titleFits = titleTextWidth > 0 && titleTextWidth < availableWithCentering;
	const centeringOffset = isSmallScreen || !titleFits ? 0 : rawOffset;

	// Centering depends on the intrinsic text width, the container width and the
	// right-side buttons (always non-empty). Until all three have reported, any
	// paint would show the title un-centered, so it stays invisible (see the
	// `visible` prop below). Small screens never center, so they never wait.
	const measured = titleTextWidth > 0 && titleContainerWidth > 0 && rightWidth > 0;

	// Inactive drawer screens are hidden with display:none on web, so every
	// element in this header reports a zero-width layout while another screen is
	// active. Accepting those zeros wipes the measurements, and each navigation
	// then re-shows the title left-aligned for a frame before it re-centers.
	// Zero is never a real measurement here — the one legitimate zero (no left
	// button on large screens) is derived above — so zero reports keep the last
	// real value.
	const handleLeftLayout = React.useCallback((event: LayoutChangeEvent) => {
		const { width } = event.nativeEvent.layout;
		setLeftWidth((previous) => (width > 0 ? width : previous));
	}, []);

	const handleRightLayout = React.useCallback((event: LayoutChangeEvent) => {
		const { width } = event.nativeEvent.layout;
		setRightWidth((previous) => (width > 0 ? width : previous));
	}, []);

	const handleTitleContainerLayout = React.useCallback((event: LayoutChangeEvent) => {
		const { width } = event.nativeEvent.layout;
		setTitleContainerWidth((previous) => (width > 0 ? width : previous));
	}, []);

	const handleIntrinsicWidth = React.useCallback((width: number) => {
		setTitleTextWidth((previous) => (width > 0 ? width : previous));
	}, []);

	return (
		<ErrorBoundary>
			<View id="titlebar">
				<View
					className="bg-sidebar border-sidebar-border border-b"
					style={{ paddingTop: insets.top }}
				>
					<HStack className="h-10 items-center">
						{/* Left section - measured for centering calculation */}
						<View testID="header-left-section" onLayout={handleLeftLayout}>
							<Left />
						</View>

						{/* Title section - flex to fill remaining space, with centering offset */}
						<View
							testID="header-title-container"
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
								visible={isSmallScreen || measured}
								onIntrinsicWidth={handleIntrinsicWidth}
							>
								{title}
							</HeaderTitle>
						</View>

						{/* Right section - measured for centering calculation */}
						<View testID="header-right-section" onLayout={handleRightLayout}>
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
