import * as React from 'react';
import { Platform } from 'react-native';

import * as Haptics from 'expo-haptics';
import * as TabsPrimitive from '@rn-primitives/tabs';
import Animated, {
	scrollTo,
	useAnimatedRef,
	useAnimatedScrollHandler,
	useSharedValue,
} from 'react-native-reanimated';

import { HStack } from '../hstack';
import { IconButton } from '../icon-button';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

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
function ScrollableTabsList({ className, children, ...props }: TabsPrimitive.ListProps) {
	const scrollRef = useAnimatedRef<Animated.ScrollView>();
	const totalWidth = useSharedValue(0);
	const containerWidth = useSharedValue(0);
	const scrollX = useSharedValue(0);
	const [scrollable, setScrollable] = React.useState(false);
	const { value, onValueChange } = TabsPrimitive.useRootContext();
	const triggersRef = React.useRef<(React.RefObject<any> | null)[]>([]);
	const tabPositions = React.useRef<{ [key: string]: { x: number; width: number } }>({});

	// Convert children to an array to safely access them
	const childrenArray = React.Children.toArray(children) as React.ReactElement[];

	// Handle scroll position updates
	const scrollHandler = useAnimatedScrollHandler({
		onScroll: (event) => {
			scrollX.value = event.contentOffset.x;
		},
	});

	// Measure and store tab positions
	const measureTab = React.useCallback((index: number, value: string) => {
		const trigger = triggersRef.current[index]?.current;
		if (trigger) {
			trigger.measure((x: number, y: number, width: number) => {
				tabPositions.current[value] = { x, width };
			});
		}
	}, []);

	// Scroll to active tab
	const scrollToActiveTab = React.useCallback(() => {
		if (!value || !scrollRef.current) return;

		const tabInfo = tabPositions.current[value];
		if (!tabInfo) return;

		const { x, width } = tabInfo;
		const currentContainerWidth = containerWidth.value;

		// Calculate target scroll position to center the tab
		const targetScrollX = x - (currentContainerWidth / 2 - width / 2);

		// Ensure we don't scroll beyond bounds
		const maxScrollX = totalWidth.value - currentContainerWidth;
		const finalScrollX = Math.max(0, Math.min(targetScrollX, maxScrollX));

		scrollTo(scrollRef, finalScrollX, 0, true);
	}, [value, containerWidth, totalWidth, scrollRef]);

	// Effect to handle scrolling when value changes
	React.useEffect(() => {
		// Small delay to ensure measurements are ready
		const timer = setTimeout(() => {
			scrollToActiveTab();
		}, 100);
		return () => clearTimeout(timer);
	}, [value, scrollToActiveTab]);

	// Update scrollable state
	React.useEffect(() => {
		setScrollable(totalWidth.value > containerWidth.value);
	}, [totalWidth.value, containerWidth.value]);

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
			<Animated.ScrollView
				ref={scrollRef}
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ flex: 1 }}
				onScroll={scrollHandler}
				scrollEventThrottle={16}
				onContentSizeChange={(w, h) => {
					totalWidth.value = w;
				}}
				onLayout={(event) => {
					containerWidth.value = event.nativeEvent.layout.width;
				}}
			>
				<TabsPrimitive.List
					className={cn(
						'bg-muted inline-flex w-full flex-row items-center justify-center rounded-md p-2',
						className
					)}
					{...props}
				>
					{childrenArray.map((child, index) => {
						// Ensure the ref array has the same length as children
						if (!triggersRef.current[index]) {
							triggersRef.current[index] = React.createRef();
						}

						const childValue = (child as any).props.value;

						return React.cloneElement(
							child as React.ReactElement,
							{
								ref: triggersRef.current[index],
								onLayout: () => {
									// Measure tab position after layout
									measureTab(index, childValue);
								},
							} as any
						);
					})}
				</TabsPrimitive.List>
			</Animated.ScrollView>
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
					'web:whitespace-nowrap inline-flex items-center justify-center rounded-md px-3 py-1.5',
					'web:ring-offset-background web:transition-all web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
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
				'pt-4',
				'web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
				className
			)}
			{...props}
		/>
	);
}

export { ScrollableTabsList, Tabs, TabsContent, TabsList, TabsTrigger };
