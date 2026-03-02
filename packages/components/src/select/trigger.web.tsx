import * as React from 'react';
import { type GestureResponderEvent, Pressable, type View } from 'react-native';

import * as Select from '@radix-ui/react-select';
import { useAugmentedRef } from '@rn-primitives/hooks';
import * as SelectPrimitive from '@rn-primitives/select';
import * as Slot from '@rn-primitives/slot';

import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

import type { SlottableTextProps } from '@rn-primitives/types';

/**
 * I was having problems with the Select.Value component from Radix, so I created this SelectValue component.
 * I think it has something to do with the Presense not working as expected below in SelectContent.
 * Something is not quite right??
 */
function Value({
	asChild,
	placeholder,
	className,
	...props
}: SlottableTextProps & { placeholder: string }) {
	const { value } = SelectPrimitive.useRootContext();
	const Component = asChild ? Slot.Text : Text;

	return (
		<TextClassContext.Provider
			value={cn('text-sm', value?.value ? 'text-foreground' : 'text-muted-foreground', className)}
		>
			<Component {...props}>{value?.label ?? placeholder}</Component>
		</TextClassContext.Provider>
	);
}

/**
 * Custom Select Trigger that passes onPress to the Pressable component.
 *
 * React Native Web's Pressable calls event.stopPropagation() in its native
 * DOM click listener, which prevents Radix Select's React synthetic onClick
 * from firing. By passing onPress directly to Pressable, the open/close
 * toggle fires in the native handler chain before stopPropagation.
 *
 * See: https://github.com/founded-labs/react-native-reusables/issues/274
 * See: https://github.com/roninoss/rn-primitives/pull/65
 */
function Trigger({
	asChild,
	onPress: onPressProp,
	role: _role,
	disabled,
	ref,
	...props
}: SelectPrimitive.TriggerProps & { ref?: React.Ref<View> }) {
	const { open, onOpenChange } = SelectPrimitive.useRootContext();

	const augmentedRef = useAugmentedRef<View>({
		ref: ref ?? null,
		methods: {
			open() {
				onOpenChange(true);
			},
			close() {
				onOpenChange(false);
			},
		},
	});

	/**
	 * Only toggle for touch/pen — mouse opens via Radix's onPointerDown,
	 * and keyboard opens via Radix's onKeyDown. Without this guard we'd
	 * double-toggle (open then immediately close) on mouse clicks.
	 */
	function onPress(ev: GestureResponderEvent) {
		if (disabled) return;
		onPressProp?.(ev);
		const pointerType = (ev.nativeEvent as unknown as { pointerType?: string })?.pointerType;
		if (pointerType && pointerType !== 'mouse') {
			onOpenChange(!open);
		}
	}

	const Component = asChild ? Slot.Pressable : Pressable;
	return (
		<Select.Trigger disabled={disabled ?? undefined} asChild>
			<Component
				onPress={onPress}
				ref={augmentedRef}
				role="button"
				disabled={disabled}
				{...props}
			/>
		</Select.Trigger>
	);
}

export { Trigger, Value };
