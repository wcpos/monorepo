import * as React from 'react';
import { TextInput } from 'react-native';

import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { cn } from '../lib/utils';

interface TextareaProps extends React.ComponentPropsWithoutRef<typeof TextInput> {
	placeholderClassName?: string;
	minHeight?: number;
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function Textarea({
	className,
	multiline = true,
	placeholderClassName,
	minHeight = 40,
	style,
	onFocus,
	onSelectionChange,
	...props
}: TextareaProps) {
	/**
	 * Local state for controlling the cursor position.
	 * Initially, this is undefined but is set when the component gains focus.
	 */
	const [selection, setSelection] = React.useState<{ start: number; end: number } | undefined>(
		undefined
	);

	/**
	 * Shared value for controlling the height of the TextInput dynamically.
	 * Initialized with the `minHeight` prop.
	 */
	const height = useSharedValue(minHeight);

	/**
	 * Animated style that adjusts the height of the TextInput.
	 * Ensures the height doesn't go below `minHeight`.
	 */
	const animatedStyle = useAnimatedStyle(() => ({
		height: Math.max(minHeight, height.value),
	}));

	/**
	 * Handler for content size changes (e.g., when the user types or deletes text).
	 * Updates the shared `height` value to match the new content height.
	 */
	const onContentSizeChange = React.useCallback(
		(e: any) => {
			const newHeight = e.nativeEvent.contentSize.height;
			if (height.value !== newHeight) {
				height.value = newHeight;
			}
		},
		[height]
	);

	/**
	 * Handler for when the TextInput gains focus.
	 * Sets the cursor position to the end of the current text and calls the parent `onFocus` handler if provided.
	 */
	const handleFocus = React.useCallback(
		(e: any) => {
			const textLength = props.value?.length || 0;
			setSelection({ start: textLength, end: textLength });
			onFocus?.(e);
		},
		[props.value?.length, onFocus]
	);

	/**
	 * Handler for when the selection changes (cursor position or text selection).
	 * Updates the local selection state to prevent cursor jumping on re-renders.
	 */
	const handleSelectionChange = React.useCallback(
		(e: any) => {
			setSelection(e.nativeEvent.selection);
			onSelectionChange?.(e);
		},
		[onSelectionChange]
	);

	/**
	 * Effect to reset the height of the TextInput to `minHeight` when the value is empty.
	 * This ensures the TextInput shrinks back to its minimum height when all text is deleted.
	 */
	React.useEffect(() => {
		if (props.value?.length === 0) {
			height.value = minHeight;
		}
	}, [height, minHeight, props.value?.length]);

	return (
		<AnimatedTextInput
			className={cn(
				'web:flex web:ring-offset-background border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-base',
				'web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
				props.editable === false && 'web:cursor-not-allowed opacity-50',
				className
			)}
			placeholderTextColor={cn('text-muted-foreground', placeholderClassName)}
			multiline={multiline}
			textAlignVertical="top"
			onContentSizeChange={onContentSizeChange}
			onFocus={handleFocus}
			selection={selection}
			onSelectionChange={handleSelectionChange}
			style={[style, animatedStyle]}
			{...props}
		/>
	);
}

export { Textarea };
