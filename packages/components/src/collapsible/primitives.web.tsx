import * as React from 'react';
import { type GestureResponderEvent, Pressable, View } from 'react-native';

import * as Collapsible from '@radix-ui/react-collapsible';
import { useComposedRefs, useControllableState } from '@rn-primitives/hooks';
import { Slot } from '@rn-primitives/slot';

import type {
	PressableRef,
	SlottablePressableProps,
	SlottableViewProps,
	ViewRef,
} from '@rn-primitives/types';
import type { CollapsibleContentProps, CollapsibleRootProps, RootContext } from './types';

/**
 * Helper to mutate DOM dataset properties outside component scope
 * so the react-compiler doesn't flag them as return-value mutations.
 */
function setDataset(el: HTMLElement, key: string, value: string | undefined) {
	el.dataset[key] = value;
}

function setElementType(el: HTMLButtonElement, type: 'button' | 'submit' | 'reset') {
	el.type = type;
}

const CollapsibleContext = React.createContext<RootContext | null>(null);

function Root({
	ref,
	asChild,
	disabled = false,
	open: openProp,
	defaultOpen,
	onOpenChange: onOpenChangeProp,
	...viewProps
}: SlottableViewProps & CollapsibleRootProps & { ref?: React.Ref<ViewRef> }) {
	const [open = false, onOpenChange] = useControllableState({
		prop: openProp,
		defaultProp: defaultOpen,
		onChange: onOpenChangeProp,
	});
	const localRef = React.useRef<ViewRef>(null);
	const composedRef = useComposedRefs(ref, localRef);

	React.useLayoutEffect(() => {
		if (localRef.current) {
			setDataset(localRef.current as unknown as HTMLDivElement, 'state', open ? 'open' : 'closed');
		}
	}, [open]);

	React.useLayoutEffect(() => {
		if (localRef.current) {
			const el = localRef.current as unknown as HTMLDivElement;
			setDataset(el, 'disabled', disabled ? 'true' : undefined);
		}
	}, [disabled]);

	const Component = asChild ? Slot : View;
	return (
		<CollapsibleContext.Provider
			value={{
				disabled,
				open,
				onOpenChange,
			}}
		>
			<Collapsible.Root
				open={open}
				defaultOpen={defaultOpen}
				onOpenChange={onOpenChange}
				disabled={disabled}
			>
				<Component ref={composedRef} {...viewProps} />
			</Collapsible.Root>
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
	ref,
	asChild,
	onPress: onPressProp,
	disabled: disabledProp = false,
	...props
}: SlottablePressableProps & { ref?: React.Ref<PressableRef> }) {
	const { disabled, open, onOpenChange } = useCollapsibleContext();
	const localRef = React.useRef<PressableRef>(null);
	const composedRef = useComposedRefs(ref, localRef);

	React.useLayoutEffect(() => {
		if (localRef.current) {
			setDataset(
				localRef.current as unknown as HTMLButtonElement,
				'state',
				open ? 'open' : 'closed'
			);
		}
	}, [open]);

	React.useLayoutEffect(() => {
		if (localRef.current) {
			const el = localRef.current as unknown as HTMLButtonElement;
			setElementType(el, 'button');
			setDataset(el, 'disabled', disabled ? 'true' : undefined);
		}
	}, [disabled]);

	function onPress(ev: GestureResponderEvent) {
		onPressProp?.(ev);
		onOpenChange(!open);
	}

	const Component = asChild ? Slot : Pressable;
	return (
		<Collapsible.Trigger disabled={disabled} asChild>
			<Component ref={composedRef} role="button" onPress={onPress} disabled={disabled} {...props} />
		</Collapsible.Trigger>
	);
}

function Content({
	ref,
	asChild,
	forceMount,
	...props
}: SlottableViewProps & CollapsibleContentProps & { ref?: React.Ref<ViewRef> }) {
	const localRef = React.useRef<ViewRef>(null);
	const composedRef = useComposedRefs(ref, localRef);
	const { open } = useCollapsibleContext();

	React.useLayoutEffect(() => {
		if (localRef.current) {
			setDataset(localRef.current as unknown as HTMLDivElement, 'state', open ? 'open' : 'closed');
		}
	}, [open]);

	const Component = asChild ? Slot : View;
	return (
		<Collapsible.Content forceMount={forceMount} asChild>
			<Component ref={composedRef} {...props} />
		</Collapsible.Content>
	);
}

export { Content, Root, Trigger, useCollapsibleContext };
