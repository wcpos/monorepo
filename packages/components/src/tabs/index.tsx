import * as React from 'react';
import { Platform, ScrollView } from 'react-native';

import * as Haptics from 'expo-haptics';
import * as TabsPrimitive from '@rn-primitives/tabs';
import { withUniwind } from 'uniwind';

import { HStack } from '../hstack';
import { IconButton } from '../icon-button';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

// Wrap ScrollView with uniwind to support className prop
const StyledScrollView = withUniwind(ScrollView);

const Tabs = TabsPrimitive.Root;

/**
 *
 */
function TabsList({ className, ...props }: TabsPrimitive.ListProps) {
	return (
		<TabsPrimitive.List
			className={cn('bg-muted inline-flex items-center justify-center rounded-md p-1', className)}
			{...props}
		/>
	);
}

/**
 *
 */
// Padding value for the tabs list (in pixels) - used in contentContainerStyle
const LIST_PADDING = 8; // p-2 = 0.5rem = 8px

function ScrollableTabsList({ className, children, ...props }: TabsPrimitive.ListProps) {
	const scrollRef = React.useRef<ScrollView>(null);
	const totalWidthRef = React.useRef(0);
	const containerWidthRef = React.useRef(0);
	const [scrollable, setScrollable] = React.useState(false);
	const { value, onValueChange } = TabsPrimitive.useRootContext();
	const tabPositions = React.useRef<{ [key: string]: { x: number; width: number } }>({});

	// Convert children to an array to safely access them
	const childrenArray = React.Children.toArray(children) as React.ReactElement[];

	// Store tab position from onLayout event
	const handleTabLayout = React.useCallback(
		(childValue: string, event: { nativeEvent: { layout: { x: number; width: number } } }) => {
			const { x, width } = event.nativeEvent.layout;
			tabPositions.current[childValue] = { x, width };
		},
		[]
	);

	// Scroll to center the active tab
	const scrollToActiveTab = React.useCallback((activeValue: string) => {
		const tabInfo = tabPositions.current[activeValue];
		if (!tabInfo || !scrollRef.current) return;

		const { x, width } = tabInfo;
		const currentContainerWidth = containerWidthRef.current;
		const currentTotalWidth = totalWidthRef.current;

		// Tab x positions are relative to TabsPrimitive.List, but scroll position is relative
		// to ScrollView content which includes horizontal padding
		const adjustedX = x + LIST_PADDING;

		// Calculate target scroll position to center the tab
		const targetScrollX = adjustedX - currentContainerWidth / 2 + width / 2;

		// Ensure we don't scroll beyond bounds
		const maxScrollX = Math.max(0, currentTotalWidth - currentContainerWidth);
		const finalScrollX = Math.max(0, Math.min(targetScrollX, maxScrollX));

		scrollRef.current.scrollTo({ x: finalScrollX, animated: true });
	}, []);

	// Scroll to active tab when value changes
	// Needed to sync on tab selection - timing relies on prior layout measurements
	React.useEffect(() => {
		if (value) {
			// Small delay to ensure measurements are ready on initial render
			const timer = setTimeout(() => {
				scrollToActiveTab(value);
			}, 100);
			return () => clearTimeout(timer);
		}
	}, [value, scrollToActiveTab]);

	const updateScrollable = React.useCallback(() => {
		const isScrollable = totalWidthRef.current > containerWidthRef.current;
		setScrollable(isScrollable);
	}, []);

	const handleContentSizeChange = React.useCallback(
		(w: number) => {
			totalWidthRef.current = w;
			updateScrollable();
		},
		[updateScrollable]
	);

	const handleLayout = React.useCallback(
		(event: { nativeEvent: { layout: { width: number } } }) => {
			const prevWidth = containerWidthRef.current;
			containerWidthRef.current = event.nativeEvent.layout.width;
			updateScrollable();

			// Re-scroll to active tab when container width changes (e.g., window resize)
			if (prevWidth !== 0 && prevWidth !== containerWidthRef.current && value) {
				// Small delay to let layout settle
				setTimeout(() => {
					scrollToActiveTab(value);
				}, 50);
			}
		},
		[updateScrollable, value, scrollToActiveTab]
	);

	const currentIndex = childrenArray.findIndex(
		(child) => React.isValidElement(child) && (child as any).props.value === value
	);

	const onPressLeft = React.useCallback(() => {
		if (currentIndex > 0) {
			const previousChild = childrenArray[currentIndex - 1];
			if (React.isValidElement(previousChild)) {
				const previousValue = (previousChild as any).props.value;
				onValueChange(previousValue);
			}
		}
	}, [currentIndex, childrenArray, onValueChange]);

	const onPressRight = React.useCallback(() => {
		if (currentIndex < childrenArray.length - 1) {
			const nextChild = childrenArray[currentIndex + 1];
			if (React.isValidElement(nextChild)) {
				const nextValue = (nextChild as any).props.value;
				onValueChange(nextValue);
			}
		}
	}, [currentIndex, childrenArray, onValueChange]);

	return (
		<HStack className="gap-0">
			{scrollable && (
				<IconButton name="chevronLeft" onPress={onPressLeft} disabled={currentIndex === 0} />
			)}
			<StyledScrollView
				ref={scrollRef}
				horizontal
				showsHorizontalScrollIndicator={false}
				className={cn('flex-1', Platform.OS === 'web' && 'scrollbar-hide')}
				contentContainerStyle={{ paddingHorizontal: LIST_PADDING }}
				scrollEventThrottle={16}
				onContentSizeChange={handleContentSizeChange}
				onLayout={handleLayout}
			>
				<TabsPrimitive.List
					className={cn('bg-muted inline-flex flex-row items-center rounded-md py-2', className)}
					{...props}
				>
					{childrenArray.map((child, index) => {
						const childValue = (child as any).props.value;

						return React.cloneElement(
							child as React.ReactElement,
							{
								key: childValue || index,
								onLayout: (event: any) => {
									handleTabLayout(childValue, event);
								},
							} as any
						);
					})}
				</TabsPrimitive.List>
			</StyledScrollView>
			{scrollable && (
				<IconButton
					name="chevronRight"
					onPress={onPressRight}
					disabled={currentIndex === childrenArray.length - 1}
				/>
			)}
		</HStack>
	);
}

/**
 *
 */
function TabsTrigger({ className, onPress, ...props }: TabsPrimitive.TriggerProps) {
	const { value } = TabsPrimitive.useRootContext();

	const handlePress = React.useCallback(
		(e: any) => {
			if (Platform.OS !== 'web' && !props.disabled) {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			}
			onPress?.(e);
		},
		[props.disabled, onPress]
	);

	return (
		<TextClassContext.Provider
			value={cn(
				'text-muted-foreground web:transition-all text-center text-sm',
				value === props.value && 'text-primary-foreground'
			)}
		>
			<TabsPrimitive.Trigger
				className={cn(
					'web:ring-offset-background web:transition-all web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2 web:whitespace-nowrap inline-flex items-center justify-center rounded-md px-3 py-1.5',
					props.disabled && 'web:pointer-events-none opacity-50',
					props.value === value && 'bg-primary shadow-sm',
					className
				)}
				onPress={handlePress}
				{...props}
			/>
		</TextClassContext.Provider>
	);
}

/**
 *
 */
function TabsContent({ className, ...props }: TabsPrimitive.ContentProps) {
	return (
		<TabsPrimitive.Content
			className={cn(
				'web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2 pt-4',
				className
			)}
			{...props}
		/>
	);
}

export { ScrollableTabsList, Tabs, TabsContent, TabsList, TabsTrigger };
