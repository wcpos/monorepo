import React from 'react';
import { View, Pressable, Text, BackHandler } from 'react-native';
import type { LayoutRectangle, GestureResponderEvent, LayoutChangeEvent } from 'react-native';

import {
	useAugmentedRef,
	useControllableState,
	useRelativePosition,
	type LayoutPosition,
} from '@rn-primitives/hooks';
import * as Slot from '@rn-primitives/slot';

import { Portal as RNPPortal } from '../portal';

import type {
	ContentProps,
	ContentRef,
	GroupProps,
	GroupRef,
	ItemIndicatorProps,
	ItemIndicatorRef,
	ItemProps,
	ItemRef,
	ItemTextProps,
	ItemTextRef,
	LabelProps,
	LabelRef,
	OverlayProps,
	OverlayRef,
	PortalProps,
	RootProps,
	RootRef,
	ScrollDownButtonProps,
	ScrollUpButtonProps,
	SeparatorProps,
	SeparatorRef,
	SharedRootContext,
	TriggerProps,
	TriggerRef,
	ValueProps,
	ValueRef,
	ViewportProps,
} from '@rn-primitives/types';

interface IRootContext extends SharedRootContext {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	triggerPosition: LayoutPosition | null;
	setTriggerPosition: (triggerPosition: LayoutPosition | null) => void;
	contentLayout: LayoutRectangle | null;
	setContentLayout: (contentLayout: LayoutRectangle | null) => void;
	nativeID: string;
}

const RootContext = React.createContext<IRootContext | null>(null);

const Root = React.forwardRef<RootRef, RootProps>(
	(
		{
			asChild,
			value: valueProp,
			defaultValue,
			onValueChange: onValueChangeProp,
			onOpenChange: onOpenChangeProp,
			disabled,
			...viewProps
		},
		ref
	) => {
		const nativeID = React.useId();
		const [value, onValueChange] = useControllableState({
			prop: valueProp,
			defaultProp: defaultValue,
			onChange: onValueChangeProp,
		});
		const [triggerPosition, setTriggerPosition] = React.useState<LayoutPosition | null>(null);
		const [contentLayout, setContentLayout] = React.useState<LayoutRectangle | null>(null);
		const [open, setOpen] = React.useState(false);

		function onOpenChange(value: boolean) {
			setOpen(value);
			onOpenChangeProp?.(value);
		}

		const Component = asChild ? Slot.View : View;
		return (
			<RootContext.Provider
				value={{
					value,
					onValueChange,
					open,
					onOpenChange,
					disabled,
					contentLayout,
					nativeID,
					setContentLayout,
					setTriggerPosition,
					triggerPosition,
				}}
			>
				<Component ref={ref} {...viewProps} />
			</RootContext.Provider>
		);
	}
);

Root.displayName = 'RootNativeCombobox';

function useRootContext() {
	const context = React.useContext(RootContext);
	if (!context) {
		throw new Error(
			'Combobox compound components cannot be rendered outside the Combobox component'
		);
	}
	return context;
}

const Trigger = React.forwardRef<TriggerRef, TriggerProps>(
	({ asChild, onPress: onPressProp, disabled = false, ...props }, ref) => {
		const { open, onOpenChange, disabled: disabledRoot, setTriggerPosition } = useRootContext();

		const augmentedRef = useAugmentedRef({
			ref,
			methods: {
				open: () => {
					onOpenChange(true);
					augmentedRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
						setTriggerPosition({ width, pageX, pageY: pageY, height });
					});
				},
				close: () => {
					setTriggerPosition(null);
					onOpenChange(false);
				},
			},
		});

		function onPress(ev: GestureResponderEvent) {
			if (disabled) return;
			augmentedRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
				setTriggerPosition({ width, pageX, pageY: pageY, height });
			});
			onOpenChange(!open);
			onPressProp?.(ev);
		}

		const Component = asChild ? Slot.Pressable : Pressable;
		return (
			<Component
				ref={augmentedRef}
				aria-disabled={disabled ?? undefined}
				role="combobox"
				onPress={onPress}
				disabled={disabled ?? disabledRoot}
				aria-expanded={open}
				{...props}
			/>
		);
	}
);

Trigger.displayName = 'TriggerNativeCombobox';

const Value = React.forwardRef<ValueRef, ValueProps>(({ asChild, placeholder, ...props }, ref) => {
	const { value } = useRootContext();
	const Component = asChild ? Slot.Text : Text;
	return (
		<Component ref={ref} {...props}>
			{value?.label ?? placeholder}
		</Component>
	);
});

Value.displayName = 'ValueNativeCombobox';

/**
 * @warning when using a custom `<PortalHost />`, you might have to adjust the Content's sideOffset.
 */
function Portal({ forceMount, hostName, children }: PortalProps) {
	const value = useRootContext();

	if (!value.triggerPosition) {
		return null;
	}

	if (!forceMount) {
		if (!value.open) {
			return null;
		}
	}

	return (
		<RNPPortal hostName={hostName} name={`${value.nativeID}_portal`}>
			<RootContext.Provider value={value}>{children}</RootContext.Provider>
		</RNPPortal>
	);
}

const Overlay = React.forwardRef<OverlayRef, OverlayProps>(
	({ asChild, forceMount, onPress: OnPressProp, closeOnPress = true, ...props }, ref) => {
		const { open, onOpenChange, setTriggerPosition, setContentLayout } = useRootContext();

		function onPress(ev: GestureResponderEvent) {
			if (closeOnPress) {
				setTriggerPosition(null);
				setContentLayout(null);
				onOpenChange(false);
			}
			OnPressProp?.(ev);
		}

		if (!forceMount) {
			if (!open) {
				return null;
			}
		}

		const Component = asChild ? Slot.Pressable : Pressable;
		return <Component ref={ref} onPress={onPress} {...props} />;
	}
);

Overlay.displayName = 'OverlayNativeCombobox';

/**
 * @info `position`, `top`, `left`, and `maxWidth` style properties are controlled internally. Opt out of this behavior by setting `disablePositioningStyle` to `true`.
 */
const Content = React.forwardRef<ContentRef, ContentProps>(
	(
		{
			asChild = false,
			forceMount,
			align = 'start',
			side = 'bottom',
			sideOffset = 0,
			alignOffset = 0,
			avoidCollisions = true,
			onLayout: onLayoutProp,
			insets,
			style,
			disablePositioningStyle,
			position: _position,
			...props
		},
		ref
	) => {
		const {
			open,
			onOpenChange,
			contentLayout,
			nativeID,
			triggerPosition,
			setContentLayout,
			setTriggerPosition,
		} = useRootContext();

		React.useEffect(() => {
			const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
				setTriggerPosition(null);
				setContentLayout(null);
				onOpenChange(false);
				return true;
			});

			return () => {
				setContentLayout(null);
				backHandler.remove();
			};
		}, []);

		const positionStyle = useRelativePosition({
			align,
			avoidCollisions,
			triggerPosition,
			contentLayout,
			alignOffset,
			insets,
			sideOffset,
			side,
			disablePositioningStyle,
		});

		function onLayout(event: LayoutChangeEvent) {
			setContentLayout(event.nativeEvent.layout);
			onLayoutProp?.(event);
		}

		if (!forceMount) {
			if (!open) {
				return null;
			}
		}

		const Component = asChild ? Slot.View : View;
		return (
			<Component
				ref={ref}
				role="list"
				nativeID={nativeID}
				aria-modal={true}
				style={[positionStyle, style]}
				onLayout={onLayout}
				onStartShouldSetResponder={onStartShouldSetResponder}
				{...props}
			/>
		);
	}
);

Content.displayName = 'ContentNativeCombobox';

const ItemContext = React.createContext<{
	itemValue: string;
	label: string;
} | null>(null);

const Item = React.forwardRef<ItemRef, ItemProps>(
	(
		{
			asChild,
			value: itemValue,
			label,
			onPress: onPressProp,
			disabled = false,
			closeOnPress = true,
			...props
		},
		ref
	) => {
		const { onOpenChange, value, onValueChange, setTriggerPosition, setContentLayout } =
			useRootContext();
		function onPress(ev: GestureResponderEvent) {
			if (closeOnPress) {
				setTriggerPosition(null);
				setContentLayout(null);
				onOpenChange(false);
			}

			onValueChange({ value: itemValue, label });
			onPressProp?.(ev);
		}

		const Component = asChild ? Slot.Pressable : Pressable;
		return (
			<ItemContext.Provider value={{ itemValue, label }}>
				<Component
					ref={ref}
					role="option"
					onPress={onPress}
					disabled={disabled}
					aria-checked={value?.value === itemValue}
					aria-valuetext={label}
					aria-disabled={!!disabled}
					accessibilityState={{
						disabled: !!disabled,
						checked: value?.value === itemValue,
					}}
					{...props}
				/>
			</ItemContext.Provider>
		);
	}
);

Item.displayName = 'ItemNativeCombobox';

function useItemContext() {
	const context = React.useContext(ItemContext);
	if (!context) {
		throw new Error('Item compound components cannot be rendered outside of an Item component');
	}
	return context;
}

const ItemText = React.forwardRef<ItemTextRef, ItemTextProps>(({ asChild, ...props }, ref) => {
	const { label } = useItemContext();

	const Component = asChild ? Slot.Text : Text;
	return (
		<Component ref={ref} {...props}>
			{label}
		</Component>
	);
});

ItemText.displayName = 'ItemTextNativeCombobox';

const Viewport = ({ children }: ViewportProps) => {
	return <>{children}</>;
};

export { Root, Trigger, Value, useRootContext, Overlay, Portal, Content, Viewport, Item, ItemText };

function onStartShouldSetResponder() {
	return true;
}
