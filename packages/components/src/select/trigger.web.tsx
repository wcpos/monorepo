import * as React from 'react';
import { Pressable, GestureResponderEvent } from 'react-native';

import * as Select from '@radix-ui/react-select';
import { useIsomorphicLayoutEffect, useAugmentedRef } from '@rn-primitives/hooks';
import * as SelectPrimitive from '@rn-primitives/select';
import * as Slot from '@rn-primitives/slot';

import type { TriggerRef, TriggerProps } from '@rn-primitives/select';

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

export { Trigger };
