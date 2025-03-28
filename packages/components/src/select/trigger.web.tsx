import * as React from 'react';
import { Pressable, GestureResponderEvent } from 'react-native';

import * as Select from '@radix-ui/react-select';
import { useIsomorphicLayoutEffect, useAugmentedRef } from '@rn-primitives/hooks';
import * as SelectPrimitive from '@rn-primitives/select';
import * as Slot from '@rn-primitives/slot';

import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

import type { TriggerRef, TriggerProps } from '@rn-primitives/select';
import type { SlottableTextProps, TextRef } from '@rn-primitives/types';

/**
 * I was having problems with the Select.Value component from Radix, so I created this SelectValue component.
 * I think it has something to do with the Presense not working as expected below in SelectContent.
 * Something is not quite right??
 */
const Value = React.forwardRef<TextRef, SlottableTextProps & { placeholder: string }>(
	({ asChild, placeholder, className, ...props }, ref) => {
		const { value } = SelectPrimitive.useRootContext();
		const Component = asChild ? Slot.Text : Text;

		return (
			<TextClassContext.Provider
				value={cn('text-sm', value?.value ? 'text-foreground' : 'text-muted-foreground', className)}
			>
				<Component ref={ref} {...props}>
					{value?.label ?? placeholder}
				</Component>
			</TextClassContext.Provider>
		);
	}
);
Value.displayName = 'ValueWebSelect';

/**
 * https://github.com/roninoss/rn-primitives/pull/65
 */
const Trigger = React.forwardRef<TriggerRef, TriggerProps>(
	({ asChild, onPress: onPressProp, role: _role, disabled, ...props }, ref) => {
		const { open, onOpenChange } = SelectPrimitive.useRootContext();
		function onPress(ev: GestureResponderEvent) {
			if (disabled) return;
			onOpenChange(!open);
			onPressProp?.(ev);
		}

		const augmentedRef = useAugmentedRef({
			ref,
			methods: {
				open() {
					onOpenChange(true);
				},
				close() {
					onOpenChange(false);
				},
			},
		});

		useIsomorphicLayoutEffect(() => {
			if (augmentedRef.current) {
				const augRef = augmentedRef.current as unknown as HTMLButtonElement;
				augRef.dataset.state = open ? 'open' : 'closed';
				augRef.type = 'button';
			}
		}, [open]);

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
);

Trigger.displayName = 'TriggerWebSelect';

export { Trigger, Value };
