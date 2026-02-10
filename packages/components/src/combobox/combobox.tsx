import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useControllableState } from '@rn-primitives/hooks';
import * as PopoverPrimitive from '@rn-primitives/popover';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Slot from '@rn-primitives/slot';

import Platform from '@wcpos/utils/platform';

import { Input } from '../input';
import * as VirtualizedListPrimitive from '../virtualized-list';
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
	value: valueProp,
	defaultValue,
	onValueChange: onValueChangeProp,
	...props
}: ComboboxRootProps<T>) {
	const [value, onValueChange] = useControllableState<Option<any> | undefined>({
		prop: valueProp as Option<any> | undefined,
		defaultProp: defaultValue as Option<any> | undefined,
		onChange: onValueChangeProp as ((value: Option<any> | undefined) => void) | undefined,
	});
	const [filterValue, setFilterValue] = React.useState('');

	const handleOpenChange = React.useCallback((open: boolean) => {
		setFilterValue('');
	}, []);

	return (
		<ComboboxRootContext.Provider
			value={{
				value,
				onValueChange,
				filterValue,
				onFilterChange: setFilterValue,
				// open,
				// onOpenChange,
				// disabled,
				// contentLayout,
				// nativeID,
				// setContentLayout,
				// setTriggerPosition,
				// triggerPosition,
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

function ComboboxValue({ asChild, placeholder, className, ...props }: ComboboxValueProps) {
	const { value } = useComboboxRootContext();
	const Component = asChild ? Slot.Text : Text;

	return (
		<View
			className={cn(
				'border-border bg-card web:ring-offset-background h-10 w-full flex-row items-center rounded-md border px-2',
				className
			)}
		>
			<View className="flex-1">
				<TextClassContext.Provider
					value={cn(
						'text-sm',
						value?.value ? 'text-foreground' : 'text-muted-foreground',
						className
					)}
				>
					<Component {...props}>{value?.label ?? placeholder}</Component>
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
	...props
}: PopoverPrimitive.ContentProps & { portalHost?: string }) {
	const context = useComboboxRootContext();

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

function ComboboxInput(props: ComboboxInputProps) {
	const { onFilterChange } = useComboboxRootContext();
	const [isPending, startTransition] = React.useTransition();
	const [inputValue, setInputValue] = React.useState('');

	const handleChange = React.useCallback(
		(currentText: string) => {
			setInputValue(currentText);

			startTransition(() => {
				if (onFilterChange) {
					onFilterChange(currentText);
				}
			});
		},
		[onFilterChange, startTransition]
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
	...restVirtualizedListProps
}: ComboboxListProps<Option>) {
	const { filterValue } = useComboboxRootContext();

	const filteredData = React.useMemo(() => {
		if (!shouldFilter || !filterValue) {
			return data;
		}
		const dataToFilter = data ? [...data] : [];
		return filter(dataToFilter, filterValue);
	}, [data, filterValue, shouldFilter, filter]);

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

function ComboboxItem({ value, label, item, className, ...props }: ComboboxItemProps) {
	const { onValueChange } = useComboboxRootContext();
	const { onOpenChange } = PopoverPrimitive.useRootContext();

	const handlePress = React.useCallback(() => {
		onValueChange({ value, label, item });
		onOpenChange(false);
	}, [onValueChange, value, label, item, onOpenChange]);

	return (
		<VirtualizedListPrimitive.Item>
			<Pressable
				onPress={handlePress}
				className={cn(
					'web:group web:cursor-default web:select-none web:hover:bg-accent/50 web:outline-none web:focus:bg-accent active:bg-accent flex w-full flex-row items-center rounded-sm px-2 py-1.5',
					props.disabled && 'web:pointer-events-none opacity-50',
					className
				)}
				{...props}
			/>
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
