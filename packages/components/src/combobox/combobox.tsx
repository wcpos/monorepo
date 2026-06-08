import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useControllableState } from '@rn-primitives/hooks';
import * as PopoverPrimitive from '@rn-primitives/popover';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ScrollView as GestureHandlerScrollView } from 'react-native-gesture-handler';
import { Slot } from '@rn-primitives/slot';

import { Platform } from '@wcpos/utils/platform';

import { Input } from '../input';
import * as VirtualizedListPrimitive from '../virtualized-list';
import { getDisplayLabel, isSelectedIn, toggleMultiValue } from '../lib/multi-select';
import { defaultFilter } from './utils/filter';
import { cn } from '../lib/utils';
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

const NATIVE_POPOVER_MAX_HEIGHT = 300;
const NATIVE_POPOVER_VERTICAL_PADDING = 16;
const NATIVE_SEARCH_INPUT_HEIGHT_WITH_MARGIN = 48;
const NATIVE_LIST_MIN_ITEM_HEIGHT = 36;
const NATIVE_LIST_MAX_HEIGHT =
	NATIVE_POPOVER_MAX_HEIGHT -
	NATIVE_POPOVER_VERTICAL_PADDING -
	NATIVE_SEARCH_INPUT_HEIGHT_WITH_MARGIN;

function getNativeListHeight(itemCount: number, estimatedItemSize: number) {
	const itemHeight = Math.max(estimatedItemSize, NATIVE_LIST_MIN_ITEM_HEIGHT);
	return Math.min(itemCount * itemHeight, NATIVE_LIST_MAX_HEIGHT);
}

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
	...props
}: ComboboxRootProps<T>) {
	const [value, onValueChange] = useControllableState<Option<any> | Option<any>[] | undefined>({
		prop: valueProp as Option<any> | Option<any>[] | undefined,
		defaultProp: defaultValue as Option<any> | Option<any>[] | undefined,
		onChange: onValueChangeProp as
			| ((value: Option<any> | Option<any>[] | undefined) => void)
			| undefined,
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
			}}
		>
			<PopoverPrimitive.Root onOpenChange={handleOpenChange}>{children}</PopoverPrimitive.Root>
		</ComboboxRootContext.Provider>
	);
}

function ComboboxTrigger({ className, disabled, ...props }: PopoverPrimitive.TriggerProps) {
	return (
		<PopoverPrimitive.Trigger
			className={cn(disabled && 'web:cursor-not-allowed opacity-50', className)}
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
	const { multiple, value } = useComboboxRootContext();
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
				'border-border bg-card web:ring-offset-background h-10 w-full flex-row items-center rounded-md border px-2',
				className
			)}
		>
			<View className="flex-1">
				<TextClassContext.Provider
					value={cn('text-sm', hasValue ? 'text-foreground' : 'text-muted-foreground', className)}
				>
					<Component {...props}>{displayText}</Component>
				</TextClassContext.Provider>
			</View>
			<Icon name="chevronDown" />
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
	...props
}: PopoverPrimitive.ContentProps & { portalHost?: string }) {
	const context = useComboboxRootContext();
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

	return (
		<PopoverPrimitive.Portal hostName={portalHost}>
			<PopoverPrimitive.Overlay style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}>
				<Animated.View entering={FadeIn.duration(200)} exiting={FadeOut}>
					<TextClassContext.Provider value="text-popover-foreground">
						<PopoverPrimitive.Content
							align={align}
							sideOffset={sideOffset}
							style={contentStyle}
							className={cn(
								'border-border bg-popover web:data-[side=bottom]:slide-in-from-top-2 web:data-[side=left]:slide-in-from-right-2 web:data-[side=right]:slide-in-from-left-2 web:data-[side=top]:slide-in-from-bottom-2 web:animate-in web:zoom-in-95 web:fade-in-0 web:cursor-auto web:outline-none z-50 max-h-[300px] w-72 rounded-md border p-2 shadow-md',
								className
							)}
							{...props}
						>
							<ComboboxRootContext.Provider value={context}>
								{children}
							</ComboboxRootContext.Provider>
							{/* <Arrow className={cn('fill-white')} /> */}
						</PopoverPrimitive.Content>
					</TextClassContext.Provider>
				</Animated.View>
			</PopoverPrimitive.Overlay>
		</PopoverPrimitive.Portal>
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
		const listHeight = getNativeListHeight(itemCountForHeight, estimatedItemSize);
		return (
			<View
				style={{
					height: listHeight,
					maxHeight: NATIVE_LIST_MAX_HEIGHT,
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
			<Text className="web:group-focus:text-accent-foreground text-popover-foreground text-sm">
				{children}
			</Text>
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
					'web:group web:cursor-default web:select-none web:hover:bg-accent/50 web:outline-none web:focus:bg-accent active:bg-accent flex w-full flex-row items-center rounded-sm px-2 py-1.5',
					multiple && 'pl-8',
					props.disabled && 'web:pointer-events-none opacity-50',
					className
				)}
				{...props}
			>
				{multiple && (
					<View className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
						{selected && <Icon name="check" className="text-popover-foreground" />}
					</View>
				)}
				{children}
			</Pressable>
		</VirtualizedListPrimitive.Item>
	);
}

function ComboboxItemText({ className, ...props }: ComboboxItemTextProps) {
	const { item } = VirtualizedListPrimitive.useItemContext();

	return (
		<Text
			className={cn(
				'web:group-focus:text-accent-foreground text-popover-foreground text-sm',
				className
			)}
			decodeHtml
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
