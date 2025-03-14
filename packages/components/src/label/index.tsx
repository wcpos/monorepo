import * as React from 'react';
import { Pressable } from 'react-native';
import type { ViewStyle } from 'react-native';

import * as LabelPrimitive from '@rn-primitives/label';
import * as Slot from '@rn-primitives/slot';

import { cn } from '../lib/utils';

import type { PressableRef, SlottablePressableProps } from '@rn-primitives/types';

interface LabelRootProps {
	children: React.ReactNode;
	style?: ViewStyle;
}

/**
 * @rn-primitives/label is not using Pressable, only a View so we don't get the onPress events
 * This makes it equivalent to a Native version from @rn-primitives/label'
 */
const Root = React.forwardRef<
	PressableRef,
	Omit<SlottablePressableProps, 'children' | 'hitSlop' | 'style'> & LabelRootProps
>(({ asChild, ...props }, ref) => {
	const Component = asChild ? Slot.Pressable : Pressable;
	return <Component ref={ref} {...props} />;
});

Root.displayName = 'RootWebLabel';

const Label = React.forwardRef<
	React.ElementRef<typeof LabelPrimitive.Text>,
	React.ComponentPropsWithoutRef<typeof LabelPrimitive.Text>
>(({ className, onPress, onLongPress, onPressIn, onPressOut, ...props }, ref) => {
	return (
		<Root
			onPress={onPress}
			onLongPress={onLongPress}
			onPressIn={onPressIn}
			onPressOut={onPressOut}
			className={cn('web:cursor-default', className)}
		>
			<LabelPrimitive.Text
				ref={ref}
				className={cn(
					'web:peer-disabled:cursor-not-allowed web:peer-disabled:opacity-70 text-foreground text-sm font-medium leading-none'
				)}
				{...props}
			/>
		</Root>
	);
});
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
