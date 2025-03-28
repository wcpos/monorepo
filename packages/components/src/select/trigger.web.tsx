import * as React from 'react';
import { Pressable, GestureResponderEvent } from 'react-native';

import { useIsomorphicLayoutEffect, useAugmentedRef } from '@rn-primitives/hooks';
import * as SelectPrimitive from '@rn-primitives/select';
import * as Slot from '@rn-primitives/slot';

import type { TriggerRef, TriggerProps } from '@rn-primitives/select';

/**
 *
 */
const Trigger = React.forwardRef<TriggerRef, TriggerProps>(
	({ asChild, role: _role, disabled, ...props }, ref) => {
		const { open, onOpenChange } = SelectPrimitive.useRootContext();
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

		/**
		 * @FIXME - select is not triggering for 'touch' events
		 * https://github.com/mrzachnugent/react-native-reusables/issues/274
		 */
		const handlePress = (event: GestureResponderEvent) => {
			if (props?.onPress) {
				props.onPress(event);
			}
			onOpenChange(true);
		};

		const Component = asChild ? Slot.Pressable : Pressable;
		return (
			<SelectPrimitive.Trigger disabled={disabled ?? undefined} asChild>
				<Component
					ref={augmentedRef}
					role="button"
					disabled={disabled}
					{...props}
					onPress={handlePress}
				/>
			</SelectPrimitive.Trigger>
		);
	}
);

Trigger.displayName = 'TriggerWebSelectFixForTouch';

export { Trigger };
