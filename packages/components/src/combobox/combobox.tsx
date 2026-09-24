import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useControllableState } from '@rn-primitives/hooks';
import * as PopoverPrimitive from '@rn-primitives/popover';
import { ScrollView as GestureHandlerScrollView } from 'react-native-gesture-handler';
import { Slot } from '@rn-primitives/slot';

import { Platform } from '@wcpos/utils/platform';

import { Input } from '../input';
import * as VirtualizedListPrimitive from '../virtualized-list';
import { getDisplayLabel, isSelectedIn, toggleMultiValue } from '../lib/multi-select';
import {
	getNativeListHeight,
	NATIVE_LIST_MAX_HEIGHT,
	NATIVE_POPOVER_MAX_HEIGHT,
	usePhoneSheetMetrics,
} from '../lib/native-popover-sizing';
import { defaultFilter } from './utils/filter';
import { OVERLAY_MOTION, OVERLAY_PANEL, OverlaySheetPanel, OverlayShell } from '../lib/overlay';
import { cn } from '../lib/utils';
import { useIsPhone } from '../lib/device';
import { useArrowKeyNavigation } from '../lib/use-arrow-key-navigation';
import { Text, TextClassContext } from '../text';
import { Icon } from '../icon';

import type {
	ComboboxEmptyProps,
	ComboboxInputProps,
	ComboboxItemProps,
	ComboboxItemTextProps,
	ComboboxListProps,
	ComboboxRootContextType,
	ComboboxRootProps,
	ComboboxValueProps,
	Option,
} from './types';

const ComboboxRootContext = React.createContext<ComboboxRootContextType | null>(null);
function useComboboxRootContext() {
	const context = React.useContext(ComboboxRootContext);
	if (!context) {
		throw new Error(
			'Combobox compound components cannot be rendered outside the Combobox component'
		);
	}
	return context;
}

function Combobox<T = undefined>({
	children,
	multiple,
	value: valueProp,
	defaultValue,
	onValueChange: onValueChangeProp,
	onOpenChange: onOpenChangeProp,
	decodeLabels = true,
	...props
}: ComboboxRootProps<T>) {
	const [value, onValueChange] = useControllableState<Option<any> | Option<any>[] | undefined>({
		prop: valueProp as Option<any> | Option<any>[] | undefined,
		defaultProp: defaultValue as Option<any> | Option<any>[] | undefined,
		onChange: onValueChangeProp as
			((value: Option<any> | Option<any>[] | undefined) => void) | undefined,
	});
	const [filterValue, setFilterValue] = React.useState('');

	const handleOpenChange = React.useCallback(
		(open: boolean) => {
			setFilterValue('');
			onOpenChangeProp?.(open);
		},
		[onOpenChangeProp]
	);

	const isSelected = React.useCallback(
		(targetValue: string) => isSelectedIn(value, targetValue, !!multiple),
		[multiple, value]
	);

	return (
		<ComboboxRootContext.Provider
			value={{
				multiple: !!multiple,
				value,
				onValueChange,
				isSelected,
				filterValue,
				onFilterChange: setFilterValue,
				decodeLabels,
			}}
		>
			<PopoverPrimitive.Root onOpenChange={handleOpenChange}>{children}</PopoverPrimitive.Root>
		</ComboboxRootContext.Provider>
	);
}

function ComboboxTrigger({ className, disabled, ...props }: PopoverPrimitive.TriggerProps) {
	return (
		<PopoverPrimitive.Trigger
			className={cn(disabled && 'web:cursor-not-allowed opacity-45', className)}
			disabled={disabled}
			{...props}
		/>
	);
}

function ComboboxValue({
	asChild,
	placeholder,
	className,
	maxDisplayLength = 24,
	...props
}: ComboboxValueProps) {
	const { multiple, value, decodeLabels } = useComboboxRootContext();
	const { open } = PopoverPrimitive.useRootContext();
	const Component = asChild ? Slot : Text;

	const displayText = React.useMemo(() => {
		if (multiple) {
			const selectedValues = (value as Option<any>[] | undefined) ?? [];
			return getDisplayLabel(selectedValues, placeholder, maxDisplayLength);
		}
		return (value as Option<any> | undefined)?.label ?? placeholder;
	}, [multiple, value, placeholder, maxDisplayLength]);

	const hasValue = multiple
		? ((value as Option<any>[] | undefined)?.length ?? 0) > 0
		: (value as Option<any> | undefined)?.value !== undefined;

	return (
		<View
			className={cn(
				'border-border bg-card h-ctl w-full flex-row items-center rounded-lg border px-3',
				open && 'border-ring',
				className
			)}
		>
			<View className="flex-1">
				<TextClassContext.Provider
					value={cn('text-base', hasValue ? 'text-foreground' : 'text-muted-foreground', className)}
				>
					{/* Same decode as ComboboxItemText, off the same `decodeLabels` switch:
					    the label shown once chosen is the label that was listed, and a term
					    or product name arrives from WooCommerce HTML-encoded. Decoding only
					    in the list made one widget read "Men's" open and "Men&#039;s" closed.
					    Only on the Text path — `asChild` hands these props to a caller's
					    component that need not understand `decodeHtml`. */}
					<Component {...props} {...(asChild ? {} : { decodeHtml: decodeLabels })}>
						{displayText}
					</Component>
				</TextClassContext.Provider>
			</View>
			<Icon name="chevronDown" className="text-muted-foreground" />
		</View>
	);
}

function ComboboxContent({
	className,
	align = 'center',
	sideOffset = 4,
	portalHost,
	children,
	style,
	inline,
	...props
}: PopoverPrimitive.ContentProps & { portalHost?: string; inline?: boolean }) {
	const context = useComboboxRootContext();
	const { open, onOpenChange } = PopoverPrimitive.useRootContext();
	const sheet = usePhoneSheetMetrics();
	const isPhone = useIsPhone();
	const isNative = Platform.OS !== 'web';
	const contentStyle = React.useMemo(() => {
		if (!isNative) return style;
		return {
			...StyleSheet.flatten(style),
			maxHeight: NATIVE_POPOVER_MAX_HEIGHT,
		};
	}, [isNative, style]);

	// Enable arrow key navigation when combobox is open
	useArrowKeyNavigation();

	// Native full-bleed accessibility wrapper: see lib/overlay.tsx.
	const content = (
		<ComboboxRootContext.Provider value={context}>{children}</ComboboxRootContext.Provider>
	);
	const shell = (
		<OverlayShell
			presentation={isPhone ? 'bottom' : 'anchored'}
			open={open}
			Scrim={PopoverPrimitive.Overlay}
			onDismiss={isPhone ? () => onOpenChange(false) : undefined}
			testID={props.testID}
		>
			<TextClassContext.Provider value="text-foreground">
				{isPhone ? (
					<OverlaySheetPanel
						testID={props.testID}
						className={className}
						// The shell pads the safe area; the panel adds only its own inset.
						style={[{ maxHeight: sheet.maxHeight }, style]}
					>
						{content}
					</OverlaySheetPanel>
				) : (
					<PopoverPrimitive.Content
						align={align}
						sideOffset={sideOffset}
						style={contentStyle}
						className={cn(
							OVERLAY_PANEL.anchored,
							'web:cursor-auto web:outline-none z-50 max-h-75 w-80',
							open ? OVERLAY_MOTION.anchored.enter : OVERLAY_MOTION.anchored.exit,
							className
						)}
						{...props}
					>
						{content}
					</PopoverPrimitive.Content>
				)}
			</TextClassContext.Provider>
		</OverlayShell>
	);
	// Inline (the gallery) has no portal, so nothing unmounts a closed sheet; the portal's
	// presence does that for every real caller.
	return inline ? (
		open ? (
			shell
		) : null
	) : (
		<PopoverPrimitive.Portal hostName={portalHost}>{shell}</PopoverPrimitive.Portal>
	);
}

function ComboboxInput({ onChangeText, ...props }: ComboboxInputProps) {
	const { onFilterChange } = useComboboxRootContext();
	const [isPending, startTransition] = React.useTransition();
	const [inputValue, setInputValue] = React.useState('');

	const handleChange = React.useCallback(
		(currentText: string) => {
			setInputValue(currentText);
			onChangeText?.(currentText);

			startTransition(() => {
				if (onFilterChange) {
					onFilterChange(currentText);
				}
			});
		},
		[onFilterChange, onChangeText, startTransition]
	);

	const handleKeyPress = React.useCallback((event: any) => {
		if (Platform.OS !== 'web') return;

		// Special case: down arrow from input should move to first item
		if (event.nativeEvent?.key === 'ArrowDown') {
			event.preventDefault();
			// Move focus to next focusable element (first item in list)
			const currentElement = document.activeElement as HTMLElement;
			if (currentElement) {
				const focusableElements = Array.from(
					document.querySelectorAll(
						'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
					)
				) as HTMLElement[];
				const currentIndex = focusableElements.indexOf(currentElement);
				const nextIndex = (currentIndex + 1) % focusableElements.length;
				focusableElements[nextIndex]?.focus();
			}
		}
	}, []);

	return (
		<Input
			testID="combobox-search"
			autoFocus
			value={inputValue}
			onChangeText={handleChange}
			onKeyPress={handleKeyPress}
			aria-busy={isPending}
			className="mb-2"
			{...props}
		/>
	);
}

function ComboboxList({
	data,
	estimatedItemSize,
	shouldFilter = true,
	filter = defaultFilter,
	ListEmptyComponent,
	...restVirtualizedListProps
}: ComboboxListProps<Option>) {
	const { filterValue } = useComboboxRootContext();
	const isPhone = useIsPhone();
	const sheet = usePhoneSheetMetrics();
	const isNative = Platform.OS !== 'web';
	const isAndroid = Platform.OS === 'android';

	const filteredData = React.useMemo(() => {
		if (!shouldFilter || !filterValue) {
			return data;
		}
		const dataToFilter = data ? [...data] : [];
		return filter(dataToFilter, filterValue);
	}, [data, filterValue, shouldFilter, filter]);

	if (isNative) {
		const itemCountForHeight =
			filteredData.length === 0 && ListEmptyComponent ? 1 : filteredData.length;
		if (itemCountForHeight === 0) return null;
		const maxHeight = isPhone ? sheet.listMaxHeight : NATIVE_LIST_MAX_HEIGHT;
		const listHeight = getNativeListHeight(itemCountForHeight, estimatedItemSize, maxHeight);
		return (
			<View
				style={{
					height: listHeight,
					maxHeight,
				}}
			>
				<VirtualizedListPrimitive.Root className="flex-1">
					<VirtualizedListPrimitive.List
						data={filteredData}
						estimatedItemSize={estimatedItemSize}
						parentProps={{ style: { height: '100%' } }}
						renderScrollComponent={isAndroid ? GestureHandlerScrollView : undefined}
						ListEmptyComponent={ListEmptyComponent}
						{...restVirtualizedListProps}
					/>
				</VirtualizedListPrimitive.Root>
			</View>
		);
	}

	return (
		<VirtualizedListPrimitive.Root className="flex-1">
			<VirtualizedListPrimitive.List
				data={filteredData}
				estimatedItemSize={estimatedItemSize}
				parentProps={{ style: { flexGrow: 1, flexShrink: 1, flexBasis: 0 } }}
				{...restVirtualizedListProps}
			/>
		</VirtualizedListPrimitive.Root>
	);
}

function ComboboxEmpty({ children, className, ...props }: ComboboxEmptyProps) {
	return (
		<View className={cn('prx-2 py-1.5', className)} {...props}>
			<Text className="text-foreground text-base">{children}</Text>
		</View>
	);
}

function ComboboxItem({ value, label, item, className, children, ...props }: ComboboxItemProps) {
	const { multiple, onValueChange, isSelected, value: currentValue } = useComboboxRootContext();
	const { onOpenChange } = PopoverPrimitive.useRootContext();
	const selected = isSelected(value);

	const handlePress = React.useCallback(() => {
		if (multiple) {
			const currentArray = (currentValue as Option<any>[] | undefined) ?? [];
			onValueChange(toggleMultiValue(currentArray, { value, label, item }));
			// Popover stays open in multi-select mode
		} else {
			onValueChange({ value, label, item });
			onOpenChange(false);
		}
	}, [multiple, onValueChange, value, label, item, onOpenChange, currentValue]);

	return (
		<VirtualizedListPrimitive.Item>
			<Pressable
				onPress={handlePress}
				role="option"
				aria-selected={selected}
				className={cn(
					'web:cursor-default web:select-none web:hover:bg-muted web:outline-none web:focus:bg-muted active:bg-muted min-h-row relative flex w-full flex-row items-center gap-2 rounded-md px-2.5 py-1.5',
					multiple && 'pl-8',
					props.disabled && 'web:pointer-events-none opacity-45',
					className
				)}
				{...props}
			>
				{multiple && (
					<View className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
						{selected && <Icon name="check" className="text-primary" />}
					</View>
				)}
				{children}
			</Pressable>
		</VirtualizedListPrimitive.Item>
	);
}

function ComboboxItemText({ className, ...props }: ComboboxItemTextProps) {
	const { item } = VirtualizedListPrimitive.useItemContext();
	const { decodeLabels } = useComboboxRootContext();

	return (
		<Text
			className={cn('text-foreground text-base', className)}
			decodeHtml={decodeLabels}
			{...props}
		>
			{item.label}
		</Text>
	);
}

export {
	ComboboxEmpty,
	ComboboxInput,
	ComboboxContent,
	ComboboxItem,
	ComboboxItemText,
	ComboboxList,
	ComboboxValue,
	ComboboxTrigger,
	Combobox,
	useComboboxRootContext,
};
