import * as React from 'react';
import { ScrollView } from 'react-native';

import * as TabsPrimitive from '@rn-primitives/tabs';
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
>(({ className, children, ...props }, ref) => {
	const scrollRef = useAnimatedRef<ScrollView>();
	const totalWidth = useSharedValue(0);
	const containerWidth = useSharedValue(0);
	const [scrollable, setScrollable] = React.useState(false);
	const { value, onValueChange } = TabsPrimitive.useRootContext();
	const triggersRef = React.useRef<(React.RefObject<any> | null)[]>([]);

	// Convert children to an array to safely access them
	const childrenArray = React.Children.toArray(children);

	React.useEffect(() => {
		if (value && triggersRef.current) {
			// Find the index of the active tab using its value
			const activeIndex = childrenArray.findIndex(
				(child) => React.isValidElement(child) && child.props.value === value
			);

			if (activeIndex !== -1 && triggersRef.current[activeIndex]) {
				const activeTrigger = triggersRef.current[activeIndex]?.current;

				if (activeTrigger) {
					activeTrigger.measure(
						(x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
							const targetScrollX = x - (containerWidth.value / 2 - width / 2);
							scrollTo(scrollRef, targetScrollX, 0, true);
						}
					);
				}
			}
		}
	}, [containerWidth.value, scrollRef, value, childrenArray]);

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

	// Define the handlers
	const onPressLeft = React.useCallback(() => {
		const currentIndex = childrenArray.findIndex(
			(child) => React.isValidElement(child) && child.props.value === value
		);

		if (currentIndex > 0) {
			const previousValue = childrenArray[currentIndex - 1].props.value;
			onValueChange(previousValue);
		}
	}, [onValueChange, value, childrenArray]);

	const onPressRight = React.useCallback(() => {
		const currentIndex = childrenArray.findIndex(
			(child) => React.isValidElement(child) && child.props.value === value
		);

		if (currentIndex < childrenArray.length - 1) {
			const nextValue = childrenArray[currentIndex + 1].props.value;
			onValueChange(nextValue);
		}
	}, [onValueChange, value, childrenArray]);

	return (
		<HStack>
			{scrollable && <IconButton name="chevronLeft" onPress={onPressLeft} />}
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
						'web:inline-flex h-10 native:h-12 items-center justify-center rounded-md bg-muted p-1 native:px-1.5',
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
			{scrollable && <IconButton name="chevronRight" onPress={onPressRight} />}
		</HStack>
	);
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Trigger>,
	React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
	const { value } = TabsPrimitive.useRootContext();
	return (
		<TextClassContext.Provider
			value={cn(
				'text-sm native:text-base font-medium text-muted-foreground web:transition-all',
				value === props.value && 'text-foreground'
			)}
		>
			<TabsPrimitive.Trigger
				ref={ref}
				className={cn(
					'inline-flex items-center justify-center shadow-none web:whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium web:ring-offset-background web:transition-all web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
					props.disabled && 'web:pointer-events-none opacity-50',
					props.value === value && 'bg-background shadow-lg shadow-foreground/10',
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
			'web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
			className
		)}
		{...props}
	/>
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
