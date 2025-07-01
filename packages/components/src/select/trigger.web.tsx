import * as React from 'react';

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
 * https://github.com/roninoss/rn-primitives/pull/65
 */
// function Trigger({
// 	asChild,
// 	onPress: onPressProp,
// 	role: _role,
// 	disabled,
// 	ref,
// 	...props
// }: TriggerProps & { ref?: React.RefObject<HTMLButtonElement> }) {
// 	const { open, onOpenChange } = SelectPrimitive.useRootContext();
// 	function onPress(ev: GestureResponderEvent) {
// 		if (disabled) return;
// 		onOpenChange(!open);
// 		onPressProp?.(ev);
// 	}

// 	const augmentedRef = useAugmentedRef({
// 		ref,
// 		methods: {
// 			open() {
// 				onOpenChange(true);
// 			},
// 			close() {
// 				onOpenChange(false);
// 			},
// 		},
// 	});

// 	useIsomorphicLayoutEffect(() => {
// 		if (augmentedRef.current) {
// 			const augRef = augmentedRef.current as unknown as HTMLButtonElement;
// 			augRef.dataset.state = open ? 'open' : 'closed';
// 			augRef.type = 'button';
// 		}
// 	}, [open]);

// 	const Component = asChild ? Slot.Pressable : Pressable;
// 	return (
// 		<Select.Trigger disabled={disabled ?? undefined} asChild>
// 			<Component
// 				onPress={onPress}
// 				ref={augmentedRef}
// 				role="button"
// 				disabled={disabled}
// 				{...props}
// 			/>
// 		</Select.Trigger>
// 	);
// }
const Trigger = SelectPrimitive.Trigger;

export { Trigger, Value };
