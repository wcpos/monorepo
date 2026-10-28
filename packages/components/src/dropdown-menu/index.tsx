import * as React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';

import * as DropdownMenuPrimitive from '@rn-primitives/dropdown-menu';

import { SHEET_LABEL_TEXT, SHEET_ROW_ROLES, useMenuSheet } from './sheet-context';
import { Icon } from '../icon';
import {
	AnchoredOverlay,
	OVERLAY_MOTION,
	OVERLAY_PANEL,
	type OverlayAnchor,
	type OverlayScrimProps,
} from '../lib/overlay';
import { cn } from '../lib/utils';
import { MenuRow, type MenuRowProps } from '../menu-row';
import { TextClassContext, Text as ThemedText } from '../text';

import type { TextProps } from '../text';

const DropdownMenu = DropdownMenuPrimitive.Root;

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

function DropdownMenuSub(props: DropdownMenuPrimitive.SubProps) {
	return useMenuSheet() ? <>{props.children}</> : <DropdownMenuPrimitive.Sub {...props} />;
}

const RadioValueContext = React.createContext<DropdownMenuPrimitive.RadioGroupProps | null>(null);
function DropdownMenuRadioGroup(props: DropdownMenuPrimitive.RadioGroupProps) {
	// The sheet's rows read the value from context; the container is a plain View.
	const { value: _value, onValueChange: _onValueChange, ...rest } = props;
	return (
		<RadioValueContext.Provider value={props}>
			{useMenuSheet() ? <View {...rest} /> : <DropdownMenuPrimitive.RadioGroup {...props} />}
		</RadioValueContext.Provider>
	);
}

const useRootContext = DropdownMenuPrimitive.useRootContext;

// The scrim must keep one component identity across renders (on web it wraps the menu, so a
// new type remounts it and replays the entrance); the caller's overlay props reach it here.
const OverlayPropsContext = React.createContext<{
	className?: string;
	style?: StyleProp<ViewStyle>;
}>({});
function MenuScrim(p: OverlayScrimProps) {
	const overlay = React.useContext(OverlayPropsContext);
	return (
		<DropdownMenuPrimitive.Overlay
			{...p}
			className={cn(overlay.className, p.className)}
			style={[p.style, overlay.style]}
		/>
	);
}
const MENU: OverlayAnchor = {
	Portal: DropdownMenuPrimitive.Portal,
	Scrim: MenuScrim,
	Content: DropdownMenuPrimitive.Content,
};

/** Text-only children (a string, a number, an interpolation's array of them) need a Text. */
function isTextChildren(children: React.ReactNode): boolean {
	// toArray drops a conditional's false, null and undefined, so `{flag && <Icon />}` beside a
	// string still reads as text when the flag is off.
	return React.Children.toArray(children).every(
		(part) => typeof part === 'string' || typeof part === 'number'
	);
}

/** Every menu row: anchored, the primitive's item presses it (`asChild`); on the sheet it presses itself. */
function MenuItemRow({
	Item,
	item: { className, children, ...item },
	select,
	...row
}: MenuRowProps & {
	Item: React.ComponentType<any>;
	item: Omit<DropdownMenuPrimitive.ItemProps, 'role'>;
	select?: () => void;
}) {
	const sheet = useMenuSheet();
	const text = isTextChildren(children as React.ReactNode);
	const parts = { ...row, className, [text ? 'label' : 'children']: children };
	if (!sheet)
		return (
			<Item asChild {...item}>
				<MenuRow {...parts} primitiveKeys />
			</Item>
		);
	return (
		<MenuRow
			{...parts}
			disabled={!!item.disabled}
			testID={item.testID}
			onPress={(event) => {
				item.onPress?.(event);
				select?.();
				if (item.closeOnPress !== false) sheet.close();
			}}
		/>
	);
}

function DropdownMenuItem(
	props: DropdownMenuPrimitive.ItemProps & { variant?: 'default' | 'destructive' }
) {
	const { variant, ...item } = props;
	return (
		<MenuItemRow Item={DropdownMenuPrimitive.Item} item={item} role="menuitem" variant={variant} />
	);
}

function DropdownMenuSubTrigger(props: React.ComponentProps<typeof AnchoredSubTrigger>) {
	return useMenuSheet() ? (
		<DropdownMenuLabel testID={props.testID} className={props.className}>
			{isTextChildren(props.children) ? (
				props.children
			) : (
				<View className="flex-row items-center gap-2">{props.children}</View>
			)}
		</DropdownMenuLabel>
	) : (
		<AnchoredSubTrigger {...props} />
	);
}
function AnchoredSubTrigger({
	className,
	children,
	...props
}: Omit<DropdownMenuPrimitive.SubTriggerProps, 'children'> & {
	children?: React.ReactNode;
}) {
	const { open } = DropdownMenuPrimitive.useSubContext();
	return (
		<DropdownMenuPrimitive.SubTrigger asChild {...props}>
			<MenuRow
				role="menuitem"
				className={cn(open && 'bg-muted', className)}
				trailing={<Icon name="chevronRight" />}
				{...(isTextChildren(children) ? { label: children } : { children })}
			/>
		</DropdownMenuPrimitive.SubTrigger>
	);
}

function DropdownMenuSubContent(props: DropdownMenuPrimitive.SubContentProps) {
	return useMenuSheet() ? (
		<View className={props.className} testID={props.testID}>
			{props.children as React.ReactNode}
		</View>
	) : (
		<AnchoredSubContent {...props} />
	);
}
function AnchoredSubContent({ className, ...props }: DropdownMenuPrimitive.SubContentProps) {
	const { open } = DropdownMenuPrimitive.useSubContext();
	return (
		<DropdownMenuPrimitive.SubContent
			className={cn(
				OVERLAY_PANEL.anchored,
				'z-50 mt-1 min-w-50 overflow-hidden p-1.5',
				open ? OVERLAY_MOTION.anchored.enter : OVERLAY_MOTION.anchored.exit,
				className
			)}
			{...props}
		/>
	);
}

function DropdownMenuContent({
	overlayClassName,
	overlayStyle,
	...props
}: DropdownMenuPrimitive.ContentProps & {
	overlayStyle?: StyleProp<ViewStyle>;
	overlayClassName?: string;
	portalHost?: string;
	inline?: boolean;
}) {
	const { open, onOpenChange } = DropdownMenuPrimitive.useRootContext();
	const overlay = React.useMemo(
		() => ({ className: overlayClassName, style: overlayStyle }),
		[overlayClassName, overlayStyle]
	);
	return (
		<OverlayPropsContext.Provider value={overlay}>
			<AnchoredOverlay
				anchor={MENU}
				open={open}
				onOpenChange={onOpenChange}
				size="min-w-50 overflow-hidden p-1.5"
				// A long menu (the user menu's stores) scrolls inside the bounded sheet.
				list="menu"
				content={{ ...props, children: props.children as React.ReactNode }}
				sheetStyle={props.style}
			/>
		</OverlayPropsContext.Provider>
	);
}

function DropdownMenuCheckboxItem(props: DropdownMenuPrimitive.CheckboxItemProps) {
	// The row is the control: a presentational box in the checkbox's skin, not a second
	// focusable Checkbox inside a menu item (CodeRabbit, #2215).
	return (
		<MenuItemRow
			Item={DropdownMenuPrimitive.CheckboxItem}
			item={props}
			role={SHEET_ROW_ROLES.checkbox}
			checkbox
			selected={props.checked}
			select={() => props.onCheckedChange?.(!props.checked)}
		/>
	);
}

function DropdownMenuRadioItem(props: DropdownMenuPrimitive.RadioItemProps) {
	const radio = React.useContext(RadioValueContext);
	return (
		<MenuItemRow
			Item={DropdownMenuPrimitive.RadioItem}
			item={props}
			role={SHEET_ROW_ROLES.radio}
			choice
			selected={radio?.value === props.value}
			select={() => radio?.onValueChange(props.value)}
		/>
	);
}

function DropdownMenuLabel({ className, ...props }: DropdownMenuPrimitive.LabelProps) {
	if (useMenuSheet())
		return (
			<View testID={props.testID} className={cn('h-9 justify-center px-2', className)}>
				{/* A composed child (an icon and a Text) reads the label style from context; RN
				    text styles do not pass through a View (CodeRabbit, #2215). */}
				<TextClassContext.Provider value={SHEET_LABEL_TEXT}>
					{isTextChildren(props.children) ? (
						<ThemedText className={SHEET_LABEL_TEXT}>{props.children}</ThemedText>
					) : (
						props.children
					)}
				</TextClassContext.Provider>
			</View>
		);
	return (
		<DropdownMenuPrimitive.Label
			className={cn(
				'text-foreground web:cursor-default px-2.5 py-1.5 text-sm font-semibold',
				className
			)}
			{...props}
		/>
	);
}

function DropdownMenuSeparator({ className, ...props }: DropdownMenuPrimitive.SeparatorProps) {
	if (useMenuSheet())
		return <View {...props} className={cn('bg-border -mx-2 my-1 h-px', className)} />;
	return (
		<DropdownMenuPrimitive.Separator
			className={cn('bg-border -mx-1.5 my-1 h-px', className)}
			{...props}
		/>
	);
}

function DropdownMenuShortcut({ className, ...props }: TextProps) {
	return <Text className={cn('text-muted-foreground ml-auto text-sm', className)} {...props} />;
}

export {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
	useRootContext,
	DropdownMenuItem,
};
