import * as React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useControllableState } from '@rn-primitives/hooks';
import * as PopoverPrimitive from '@rn-primitives/popover';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Platform } from '@wcpos/utils/platform';

import { Checkbox } from '../checkbox';
import { Icon } from '../icon';
import { Input } from '../input';
import { useArrowKeyNavigation } from '../lib/use-arrow-key-navigation';
import { applyCascadeToggle, useHierarchy } from '../lib/use-hierarchy';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';
import { INDENT_PX } from '../tree-select/tree-item';
import * as VirtualizedListPrimitive from '../virtualized-list';

import type { FlatTreeItem } from '../lib/use-hierarchy';
import type { TreeComboboxContentProps, TreeComboboxProps } from './types';

type ComboboxOption<T = undefined> = { value: string; label: string; item?: T };

// --- Context ---

interface TreeComboboxContextType {
	hierarchy: ReturnType<typeof useHierarchy<any>>;
	displayItems: FlatTreeItem<any>[];
	isSearching: boolean;
	isSelected: (value: string) => boolean;
	selectItem: (value: string, label: string) => void;
	multiple: boolean;
	parentSelectable: boolean;
	filterValue: string;
	onFilterChange: (value: string) => void;
	searchMode: 'tree' | 'flat';
}

interface TreeComboboxWidthContextType {
	triggerWidth: number | undefined;
	setTriggerWidth: (width: number) => void;
}

const TreeComboboxWidthContext = React.createContext<TreeComboboxWidthContextType>({
	triggerWidth: undefined,
	setTriggerWidth: () => {},
});

const TreeComboboxContext = React.createContext<TreeComboboxContextType | null>(null);

function useTreeComboboxContext() {
	const context = React.useContext(TreeComboboxContext);
	if (!context) {
		throw new Error('TreeCombobox compound components must be rendered inside TreeCombobox');
	}
	return context;
}

// --- Root ---

function TreeCombobox<T = undefined>({
	children,
	options,
	value: valueProp,
	defaultValue,
	onValueChange: onValueChangeProp,
	multiple,
	maxDepth,
	parentSelectable = true,
	searchMode = 'tree',
	defaultExpanded = 'none',
	expandedIds: controlledExpandedIds,
	onExpandChange,
	cascadeSelection = !!multiple,
}: TreeComboboxProps<T>) {
	const [filterValue, setFilterValue] = React.useState('');
	const [triggerWidth, setTriggerWidth] = React.useState<number | undefined>();
	const [, startTransition] = React.useTransition();

	const handleFilterChange = React.useCallback(
		(text: string) => {
			startTransition(() => {
				setFilterValue(text);
			});
		},
		[startTransition]
	);

	const hierarchy = useHierarchy(options, {
		maxDepth,
		defaultExpanded,
		expandedIds: controlledExpandedIds,
		onExpandChange,
		searchMode,
		filterValue,
	});

	const isSearching = filterValue.trim().length > 0;
	const displayItems = isSearching ? hierarchy.filteredItems : hierarchy.visibleItems;

	const [value, onValueChange] = useControllableState<
		ComboboxOption | ComboboxOption[] | undefined
	>({
		prop: valueProp as ComboboxOption | ComboboxOption[] | undefined,
		defaultProp: defaultValue as ComboboxOption | ComboboxOption[] | undefined,
		onChange: onValueChangeProp as
			| ((v: ComboboxOption | ComboboxOption[] | undefined) => void)
			| undefined,
	});

	const isSelected = React.useCallback(
		(itemValue: string) => {
			if (multiple) {
				return (value as ComboboxOption[] | undefined)?.some((v) => v.value === itemValue) ?? false;
			}
			return (value as ComboboxOption | undefined)?.value === itemValue;
		},
		[multiple, value]
	);

	const toOption = React.useCallback(
		(id: string, fallbackLabel: string): ComboboxOption<T> => {
			const node = hierarchy.nodeMap.get(id);
			return { value: id, label: node?.label ?? fallbackLabel, item: node?.item };
		},
		[hierarchy.nodeMap]
	);

	const selectItem = React.useCallback(
		(itemValue: string, itemLabel: string) => {
			if (multiple) {
				const currentValues = (value as ComboboxOption<T>[] | undefined) ?? [];
				if (cascadeSelection) {
					const next = applyCascadeToggle(currentValues, itemValue, hierarchy.nodeMap).map(
						(option) => toOption(option.value, option.label)
					);
					onValueChange(next as any);
				} else {
					const exists = currentValues.some((v) => v.value === itemValue);
					if (exists) {
						onValueChange(currentValues.filter((v) => v.value !== itemValue) as any);
					} else {
						onValueChange([...currentValues, toOption(itemValue, itemLabel)] as any);
					}
				}
			} else {
				onValueChange(toOption(itemValue, itemLabel) as any);
			}
		},
		[multiple, value, onValueChange, cascadeSelection, hierarchy.nodeMap, toOption]
	);

	const handleOpenChange = React.useCallback((open: boolean) => {
		if (!open) setFilterValue('');
	}, []);

	const contextValue = React.useMemo<TreeComboboxContextType>(
		() => ({
			hierarchy,
			displayItems,
			isSearching,
			isSelected,
			selectItem,
			multiple: !!multiple,
			parentSelectable,
			filterValue,
			onFilterChange: handleFilterChange,
			searchMode,
		}),
		[
			hierarchy,
			displayItems,
			isSearching,
			isSelected,
			selectItem,
			multiple,
			parentSelectable,
			filterValue,
			handleFilterChange,
			searchMode,
		]
	);

	const widthContextValue = React.useMemo(
		() => ({ triggerWidth, setTriggerWidth }),
		[triggerWidth]
	);

	return (
		<PopoverPrimitive.Root onOpenChange={handleOpenChange}>
			<TreeComboboxContext.Provider value={contextValue}>
				<TreeComboboxWidthContext.Provider value={widthContextValue}>
					{children}
				</TreeComboboxWidthContext.Provider>
			</TreeComboboxContext.Provider>
		</PopoverPrimitive.Root>
	);
}

// --- Trigger ---

function TreeComboboxTrigger({
	className,
	disabled,
	onLayout,
	...props
}: PopoverPrimitive.TriggerProps) {
	const { setTriggerWidth } = React.useContext(TreeComboboxWidthContext);

	const handleLayout = React.useCallback(
		(e: import('react-native').LayoutChangeEvent) => {
			setTriggerWidth(e.nativeEvent.layout.width);
			onLayout?.(e);
		},
		[setTriggerWidth, onLayout]
	);

	return (
		<PopoverPrimitive.Trigger
			className={cn(disabled && 'web:cursor-not-allowed opacity-50', className)}
			disabled={disabled}
			onLayout={handleLayout}
			{...props}
		/>
	);
}

// --- Content ---

function TreeComboboxContent<T>({
	children,
	portalHost,
	className,
	matchWidth,
	searchPlaceholder = 'Search...',
	emptyMessage = 'No results found',
	estimatedItemSize = 36,
	renderItem,
}: TreeComboboxContentProps<T>) {
	const ctx = useTreeComboboxContext();
	const widthCtx = React.useContext(TreeComboboxWidthContext);
	const { onOpenChange } = PopoverPrimitive.useRootContext();

	useArrowKeyNavigation();

	const renderTreeItem = React.useCallback(
		({ item: flatItem }: { item: FlatTreeItem<T> }) => {
			const structuralHasChildren =
				ctx.hierarchy.nodeMap.get(flatItem.value)?.hasChildren ?? flatItem.hasChildren;

			const handlePress = () => {
				if (!ctx.parentSelectable && structuralHasChildren) {
					ctx.hierarchy.toggle(flatItem.value);
					return;
				}
				ctx.selectItem(flatItem.value, flatItem.label);
				if (!ctx.multiple) onOpenChange(false);
			};

			const handleToggle = () => {
				ctx.hierarchy.toggle(flatItem.value);
			};

			const selected = ctx.isSelected(flatItem.value);

			const defaultRender = () => (
				<VirtualizedListPrimitive.Item>
					<View className="flex flex-row items-center">
						<View style={{ width: flatItem.depth * INDENT_PX }} />
						<Pressable
							onPress={handlePress}
							className="web:group web:cursor-default web:select-none web:hover:bg-accent/50 web:outline-none web:focus:bg-accent active:bg-accent flex-1 flex-row items-center gap-2 rounded-sm px-2 py-1.5"
						>
							{ctx.multiple ? (
								<Checkbox
									checked={selected}
									onCheckedChange={() => handlePress()}
									className="pointer-events-none"
								/>
							) : (
								<View className="h-4 w-4 items-center justify-center">
									{selected && <Icon name="check" className="text-popover-foreground" size="xs" />}
								</View>
							)}
							<View className="flex-1">
								<Text className="text-popover-foreground text-sm" decodeHtml>
									{flatItem.label}
								</Text>
								{ctx.isSearching && ctx.searchMode === 'flat' && flatItem.parentId && (
									<Text className="text-muted-foreground text-xs" decodeHtml>
										{ctx.hierarchy.getBreadcrumb(flatItem.value)}
									</Text>
								)}
							</View>
						</Pressable>
						{flatItem.hasChildren ? (
							<Pressable
								onPress={handleToggle}
								className="h-6 w-6 items-center justify-center"
								hitSlop={4}
							>
								<Icon
									name={flatItem.isExpanded ? 'chevronDown' : 'chevronRight'}
									size="xs"
									className="text-muted-foreground"
								/>
							</Pressable>
						) : (
							<View className="w-6" />
						)}
					</View>
				</VirtualizedListPrimitive.Item>
			);

			if (renderItem) return renderItem(flatItem as FlatTreeItem<T>, defaultRender);
			return defaultRender();
		},
		[ctx, onOpenChange, renderItem]
	);

	return (
		<PopoverPrimitive.Portal hostName={portalHost}>
			<PopoverPrimitive.Overlay style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}>
				<Animated.View entering={FadeIn.duration(200)} exiting={FadeOut}>
					<TextClassContext.Provider value="text-popover-foreground">
						<PopoverPrimitive.Content
							align="center"
							sideOffset={4}
							style={
								matchWidth && widthCtx.triggerWidth ? { width: widthCtx.triggerWidth } : undefined
							}
							className={cn(
								'border-border bg-popover web:animate-in web:zoom-in-95 web:fade-in-0 web:cursor-auto web:outline-none z-50 max-h-[300px] w-72 rounded-md border p-2 shadow-md',
								className
							)}
						>
							{children}
							<Input
								autoFocus
								value={ctx.filterValue}
								onChangeText={ctx.onFilterChange}
								placeholder={searchPlaceholder}
								className="mb-2"
							/>
							{ctx.displayItems.length > 0 ? (
								<VirtualizedListPrimitive.Root className="flex-1">
									<VirtualizedListPrimitive.List
										data={ctx.displayItems}
										estimatedItemSize={estimatedItemSize}
										renderItem={renderTreeItem as any}
										parentProps={{
											style: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
										}}
									/>
								</VirtualizedListPrimitive.Root>
							) : (
								ctx.isSearching && (
									<View className="px-2 py-1.5">
										<Text className="text-popover-foreground text-sm">{emptyMessage}</Text>
									</View>
								)
							)}
						</PopoverPrimitive.Content>
					</TextClassContext.Provider>
				</Animated.View>
			</PopoverPrimitive.Overlay>
		</PopoverPrimitive.Portal>
	);
}

export { TreeCombobox, TreeComboboxTrigger, TreeComboboxContent, useTreeComboboxContext };
