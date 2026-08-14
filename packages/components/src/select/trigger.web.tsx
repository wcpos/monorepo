import * as React from 'react';
import { type GestureResponderEvent, Pressable, type View } from 'react-native';

import * as Select from '@radix-ui/react-select';
import { useComposedRefs } from '@rn-primitives/hooks';
import * as SelectPrimitive from '@rn-primitives/select';
import { Slot } from '@rn-primitives/slot';

import { shouldToggleFromPress } from './pointer-type';
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
	const textClass = React.useContext(TextClassContext);
	const Component = asChild ? Slot : Text;

	return (
		<TextClassContext.Provider
			value={cn(textClass, 'text-sm', !value?.value && 'text-muted-foreground', className)}
		>
			<Component {...props}>{value?.label ?? placeholder}</Component>
		</TextClassContext.Provider>
	);
}

/**
 * Custom Select Trigger that passes onPress to the Pressable component.
 *
 * Radix's Select trigger opens on touch through its own `onClick`, but
 * react-native-web's Pressable spreads its press handlers (including `onClick`)
 * over the props it was given, so Radix's click handler is dropped and never
 * runs — and the one it does keep, `stopPropagation`, would swallow it anyway.
 * Passing `onPress` to the Pressable puts the touch/pen open back under our
 * control; mouse and keyboard still open through Radix's own handlers.
 *
 * See: https://github.com/founded-labs/react-native-reusables/issues/274
 * See: https://github.com/roninoss/rn-primitives/pull/65
 */
function Trigger({
	asChild,
	onPress: onPressProp,
	onPointerDown: onPointerDownProp,
	role: _role,
	disabled,
	ref,
	...props
}: SelectPrimitive.TriggerProps & {
	ref?: React.Ref<View>;
	onPointerDown?: (ev: React.PointerEvent) => void;
}) {
	const { open, onOpenChange } = SelectPrimitive.useRootContext();

	const localRef = React.useRef<View>(null);
	const composedRef = useComposedRefs(ref, localRef);

	React.useImperativeHandle(ref, () =>
		Object.assign(localRef.current ?? ({} as View), {
			open() {
				onOpenChange(true);
			},
			close() {
				onOpenChange(false);
			},
		})
	);

	/**
	 * The pointer type of the gesture in flight, captured from `pointerdown`.
	 *
	 * It has to come from `pointerdown` and not from the press event itself:
	 * react-native-web synthesises `onPress` from the DOM `click` event, and
	 * WebKit reports `pointerType: 'mouse'` on the compatibility `click` it
	 * dispatches after a touch. Every browser on iPadOS is WebKit, so reading
	 * the click's own `pointerType` made every touch look like a mouse click
	 * and no select ever opened on an iPad (#863). `pointerdown` reports the
	 * true pointer type in every engine — this is also how Radix itself tracks
	 * it internally.
	 *
	 * `null` means "no pointer gesture in flight", which is the keyboard case:
	 * Enter/Space reach `onPress` without a preceding `pointerdown`. It is
	 * reset after every press so a stale touch value can never leak into a
	 * later keyboard activation.
	 */
	const pointerTypeRef = React.useRef<string | null>(null);

	function onPointerDown(ev: React.PointerEvent) {
		pointerTypeRef.current = ev.pointerType || null;
		onPointerDownProp?.(ev);
	}

	/**
	 * Only toggle for touch/pen — mouse opens via Radix's onPointerDown,
	 * and keyboard opens via Radix's onKeyDown. Without this guard we'd
	 * double-toggle (open then immediately close) on mouse clicks.
	 */
	function onPress(ev: GestureResponderEvent) {
		if (disabled) return;
		onPressProp?.(ev);
		const pointerType = pointerTypeRef.current;
		pointerTypeRef.current = null;
		if (shouldToggleFromPress(pointerType)) {
			onOpenChange(!open);
		}
	}

	const Component = asChild ? Slot : Pressable;
	return (
		<Select.Trigger disabled={disabled ?? undefined} asChild>
			<Component
				onPress={onPress}
				onPointerDown={onPointerDown}
				ref={composedRef}
				role="button"
				disabled={disabled}
				{...props}
			/>
		</Select.Trigger>
	);
}

export { Trigger, Value };
