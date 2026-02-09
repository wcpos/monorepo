import * as React from 'react';
import { type GestureResponderEvent, Pressable, View } from 'react-native';

import { useControllableState } from '@rn-primitives/hooks';
import * as Slot from '@rn-primitives/slot';

import type { CollapsibleContentProps, CollapsibleRootProps, RootContext } from './types';
import type { SlottablePressableProps, SlottableViewProps, ViewRef } from '@rn-primitives/types';

const CollapsibleContext = React.createContext<(RootContext & { nativeID: string }) | null>(null);

function Root({
	ref,
	asChild,
	disabled = false,
	open: openProp,
	defaultOpen,
	onOpenChange: onOpenChangeProp,
	...viewProps
}: SlottableViewProps & CollapsibleRootProps & { ref?: React.Ref<ViewRef> }) {
	const nativeID = React.useId();
	const [open = false, onOpenChange] = useControllableState({
		prop: openProp,
		defaultProp: defaultOpen,
		onChange: onOpenChangeProp,
	});

	const Component = asChild ? Slot.View : View;
	return (
		<CollapsibleContext.Provider
			value={{
				disabled,
				open,
				onOpenChange,
				nativeID,
			}}
		>
			<Component ref={ref} {...viewProps} />
		</CollapsibleContext.Provider>
	);
}

function useCollapsibleContext() {
	const context = React.useContext(CollapsibleContext);
	if (!context) {
		throw new Error(
			'Collapsible compound components cannot be rendered outside the Collapsible component'
		);
	}
	return context;
}

function Trigger({
	asChild,
	onPress: onPressProp,
	disabled: disabledProp = false,
	...props
}: SlottablePressableProps) {
	const { disabled, open, onOpenChange, nativeID } = useCollapsibleContext();

	function onPress(ev: GestureResponderEvent) {
		if (disabled || disabledProp) return;
		onOpenChange(!open);
		onPressProp?.(ev);
	}

	const Component = asChild ? Slot.Pressable : Pressable;
	return (
		<Component
			nativeID={nativeID}
			aria-disabled={(disabled || disabledProp) ?? undefined}
			role="button"
			onPress={onPress}
			accessibilityState={{
				expanded: open,
				disabled: (disabled || disabledProp) ?? undefined,
			}}
			disabled={disabled || disabledProp}
			{...props}
		/>
	);
}

function Content({
	ref,
	asChild,
	forceMount,
	...props
}: SlottableViewProps & CollapsibleContentProps & { ref?: React.Ref<ViewRef> }) {
	const { nativeID, open } = useCollapsibleContext();

	if (!forceMount) {
		if (!open) {
			return null;
		}
	}

	const Component = asChild ? Slot.View : View;
	return (
		<Component
			ref={ref}
			aria-hidden={!(forceMount || open)}
			aria-labelledby={nativeID}
			role={'region'}
			{...props}
		/>
	);
}

export { Content, Root, Trigger, useCollapsibleContext };
