import * as React from 'react';
import { ScrollView } from 'react-native';

import * as TabsPrimitive from '@rn-primitives/tabs';
import debounce from 'lodash/debounce';
import {
	useSharedValue,
	useAnimatedRef,
	scrollTo,
	runOnJS,
	useAnimatedReaction,
} from 'react-native-reanimated';

import { HStack } from '../hstack';
import { IconButton } from '../icon-button';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.List>,
	React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
	<TabsPrimitive.List
		ref={ref}
		className={cn('bg-muted inline-flex items-center justify-center rounded-md p-1', className)}
		{...props}
	/>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const ScrollableTabsList = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.List>,
	React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
	const [activeIndex, setActiveIndex] = React.useState(-1);
	const scrollRef = useAnimatedRef<ScrollView>();
	const totalWidth = useSharedValue(0);
	const containerWidth = useSharedValue(0);
	const [scrollable, setScrollable] = React.useState(false);
	const { value, onValueChange } = TabsPrimitive.useRootContext();
	const triggersRef = React.useRef<(React.RefObject<any> | null)[]>([]);

	// Convert children to an array to safely access them
	const childrenArray = React.Children.toArray(children);

	React.useEffect(() => {
		// Compute active index on the JS thread.
		const index = childrenArray.findIndex(
			(child) => React.isValidElement(child) && child.props.value === value
		);
		setActiveIndex(index);
	}, [value, childrenArray]);

	const handleMeasureAndScroll = React.useCallback(
		debounce((currentContainerWidth: number) => {
			if (activeIndex !== -1 && triggersRef.current[activeIndex]) {
				const activeTrigger = triggersRef.current[activeIndex]?.current;
				if (activeTrigger) {
					activeTrigger.measure(
						(x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
							const targetScrollX = x - (currentContainerWidth / 2 - width / 2);
							scrollTo(scrollRef, targetScrollX, 0, true);
						}
					);
				}
			}
		}, 100),
		[activeIndex, scrollRef]
	);

	useAnimatedReaction(
		() => containerWidth.value,
		(currentContainerWidth) => {
			runOnJS(handleMeasureAndScroll)(currentContainerWidth);
		},
		[containerWidth]
	);

	useAnimatedReaction(
		() => {
			return totalWidth.value > containerWidth.value;
		},
		(result, previous) => {
			if (result !== previous) {
				runOnJS(setScrollable)(result);
			}
		},
		[totalWidth, containerWidth, setScrollable]
	);

	const currentIndex = childrenArray.findIndex(
		(child) => React.isValidElement(child) && child.props.value === value
	);

	const onPressLeft = React.useCallback(() => {
		if (currentIndex > 0) {
			const previousValue = childrenArray[currentIndex - 1].props.value;
			onValueChange(previousValue);
		}
	}, [currentIndex, childrenArray, onValueChange]);

	const onPressRight = React.useCallback(() => {
		if (currentIndex < childrenArray.length - 1) {
			const nextValue = childrenArray[currentIndex + 1].props.value;
			onValueChange(nextValue);
		}
	}, [currentIndex, childrenArray, onValueChange]);

	return (
		<HStack className="gap-0">
			{scrollable && (
				<IconButton name="chevronLeft" onPress={onPressLeft} disabled={currentIndex === 0} />
			)}
			<ScrollView
				ref={scrollRef}
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ flex: 1 }}
				onContentSizeChange={(w, h) => {
					totalWidth.value = w;
				}}
				onLayout={(event) => {
					containerWidth.value = event.nativeEvent.layout.width;
				}}
			>
				<TabsPrimitive.List
					ref={ref}
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

						return React.cloneElement(child as React.ReactElement, {
							ref: triggersRef.current[index],
						});
					})}
				</TabsPrimitive.List>
			</ScrollView>
			{scrollable && (
				<IconButton
					name="chevronRight"
					onPress={onPressRight}
					disabled={currentIndex === childrenArray.length - 1}
				/>
			)}
		</HStack>
	);
});
ScrollableTabsList.displayName = 'ScrollableTabsList';

const TabsTrigger = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Trigger>,
	React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
	const { value } = TabsPrimitive.useRootContext();
	return (
		<TextClassContext.Provider
			value={cn(
				'text-muted-foreground web:transition-all text-center text-sm',
				value === props.value && 'text-primary-foreground'
			)}
		>
			<TabsPrimitive.Trigger
				ref={ref}
				className={cn(
					'web:whitespace-nowrap inline-flex items-center justify-center rounded-sm px-3 py-1.5 shadow-none',
					'web:ring-offset-background web:transition-all web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
					props.disabled && 'web:pointer-events-none opacity-50',
					props.value === value && 'bg-primary shadow-foreground/10 native:shadow-sm shadow-lg',
					className
				)}
				{...props}
			/>
		</TextClassContext.Provider>
	);
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
	<TabsPrimitive.Content
		ref={ref}
		className={cn(
			'pt-4',
			'web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
			className
		)}
		{...props}
	/>
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger, ScrollableTabsList };
