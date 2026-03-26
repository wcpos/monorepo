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
import { TreeItemRow } from '../tree-select/tree-item';
import * as VirtualizedListPrimitive from '../virtualized-list';

import type { FlatTreeItem } from '../lib/use-hierarchy';
import type { TreeComboboxProps } from './types';

type ComboboxOption<T = undefined> = { value: string; label: string; item?: T };

function TreeCombobox<T = undefined>({
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
	placeholder = 'Select...',
	searchPlaceholder = 'Search...',
	disabled,
	portalHost,
	className,
	estimatedItemSize = 36,
	emptyMessage = 'No results found',
	renderItem,
	cascadeSelection,
}: TreeComboboxProps<T>) {
	const [filterValue, setFilterValue] = React.useState('');
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

	// Value state
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

	const handleSelect = React.useCallback(
		(itemValue: string, itemLabel: string, onOpenChange: (open: boolean) => void) => {
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
				onOpenChange(false);
			}
		},
		[multiple, value, onValueChange, cascadeSelection, hierarchy.nodeMap, toOption]
	);

	// Display text
	const displayText = React.useMemo(() => {
		if (multiple) {
			const selected = (value as ComboboxOption[] | undefined) ?? [];
			if (selected.length === 0) return placeholder;
			const labels = selected.map((v) => v.label).join(', ');
			if (labels.length <= 24) return labels;
			return `${selected[0].label} +${selected.length - 1}`;
		}
		return (value as ComboboxOption | undefined)?.label ?? placeholder;
	}, [multiple, value, placeholder]);

	const hasValue = multiple
		? ((value as ComboboxOption[] | undefined)?.length ?? 0) > 0
		: (value as ComboboxOption | undefined) !== undefined;

	const handleOpenChange = React.useCallback((open: boolean) => {
		if (!open) setFilterValue('');
	}, []);

	return (
		<PopoverPrimitive.Root onOpenChange={handleOpenChange}>
			<PopoverPrimitive.Trigger
				disabled={disabled}
				className={cn(
					'border-border bg-card web:ring-offset-background h-10 w-full flex-row items-center rounded-md border px-2',
					disabled && 'web:cursor-not-allowed opacity-50',
					className
				)}
			>
				<View className="flex-1">
					<Text
						className={cn('text-sm', hasValue ? 'text-foreground' : 'text-muted-foreground')}
						numberOfLines={1}
						decodeHtml
					>
						{displayText}
					</Text>
				</View>
				<Icon name="chevronDown" />
			</PopoverPrimitive.Trigger>
			<TreeComboboxContent
				hierarchy={hierarchy}
				displayItems={displayItems}
				isSelected={isSelected}
				handleSelect={handleSelect}
				multiple={!!multiple}
				parentSelectable={parentSelectable}
				portalHost={portalHost}
				searchPlaceholder={searchPlaceholder}
				filterValue={filterValue}
				onFilterChange={handleFilterChange}
				estimatedItemSize={estimatedItemSize}
				emptyMessage={emptyMessage}
				isSearching={isSearching}
				searchMode={searchMode}
				renderItem={renderItem}
			/>
		</PopoverPrimitive.Root>
	);
}

function TreeComboboxContent<T>({
	hierarchy,
	displayItems,
	isSelected,
	handleSelect,
	multiple,
	parentSelectable,
	portalHost,
	searchPlaceholder,
	filterValue,
	onFilterChange,
	estimatedItemSize,
	emptyMessage,
	isSearching,
	searchMode,
	renderItem,
}: {
	hierarchy: ReturnType<typeof useHierarchy<T>>;
	displayItems: FlatTreeItem<T>[];
	isSelected: (value: string) => boolean;
	handleSelect: (value: string, label: string, onOpenChange: (open: boolean) => void) => void;
	multiple: boolean;
	parentSelectable: boolean;
	portalHost?: string;
	searchPlaceholder: string;
	filterValue: string;
	onFilterChange: (value: string) => void;
	estimatedItemSize: number;
	emptyMessage: string;
	isSearching: boolean;
	searchMode: 'tree' | 'flat';
	renderItem?: TreeComboboxProps<T>['renderItem'];
}) {
	const { onOpenChange } = PopoverPrimitive.useRootContext();

	// Enable arrow key navigation when combobox is open
	useArrowKeyNavigation();

	const renderTreeItem = React.useCallback(
		({ item: flatItem }: { item: FlatTreeItem<T> }) => {
			const handlePress = () => {
				const structuralHasChildren =
					hierarchy.nodeMap.get(flatItem.value)?.hasChildren ?? flatItem.hasChildren;
				if (!parentSelectable && structuralHasChildren) {
					hierarchy.toggle(flatItem.value);
					return;
				}
				handleSelect(flatItem.value, flatItem.label, onOpenChange);
			};

			const selected = isSelected(flatItem.value);

			const defaultRender = () => (
				<VirtualizedListPrimitive.Item>
					<TreeItemRow item={flatItem} onToggle={hierarchy.toggle}>
						<Pressable
							onPress={handlePress}
							className={cn(
								'web:group web:cursor-default web:select-none web:hover:bg-accent/50 web:outline-none web:focus:bg-accent active:bg-accent flex-1 flex-row items-center gap-2 rounded-sm px-2 py-1.5'
							)}
						>
							{multiple && (
								<Checkbox
									checked={selected}
									onCheckedChange={() => handlePress()}
									className="pointer-events-none"
								/>
							)}
							<View className="flex-1">
								<Text className="text-popover-foreground text-sm" decodeHtml>
									{flatItem.label}
								</Text>
								{isSearching && searchMode === 'flat' && flatItem.parentId && (
									<Text className="text-muted-foreground text-xs" decodeHtml>
										{hierarchy.getBreadcrumb(flatItem.value)}
									</Text>
								)}
							</View>
							{!multiple && selected && (
								<Icon name="check" className="text-popover-foreground" size="xs" />
							)}
						</Pressable>
					</TreeItemRow>
				</VirtualizedListPrimitive.Item>
			);

			if (renderItem) return renderItem(flatItem, defaultRender);
			return defaultRender();
		},
		[
			parentSelectable,
			multiple,
			hierarchy,
			handleSelect,
			isSelected,
			isSearching,
			searchMode,
			onOpenChange,
			renderItem,
		]
	);

	return (
		<PopoverPrimitive.Portal hostName={portalHost}>
			<PopoverPrimitive.Overlay style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}>
				<Animated.View entering={FadeIn.duration(200)} exiting={FadeOut}>
					<TextClassContext.Provider value="text-popover-foreground">
						<PopoverPrimitive.Content
							align="start"
							sideOffset={4}
							className="border-border bg-popover web:animate-in web:zoom-in-95 web:fade-in-0 web:cursor-auto web:outline-none z-50 max-h-[300px] w-72 rounded-md border p-2 shadow-md"
						>
							<Input
								autoFocus
								value={filterValue}
								onChangeText={onFilterChange}
								placeholder={searchPlaceholder}
								className="mb-2"
							/>
							{displayItems.length > 0 ? (
								<VirtualizedListPrimitive.Root className="flex-1">
									<VirtualizedListPrimitive.List
										data={displayItems}
										estimatedItemSize={estimatedItemSize}
										renderItem={renderTreeItem as any}
										parentProps={{
											style: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
										}}
									/>
								</VirtualizedListPrimitive.Root>
							) : (
								isSearching && (
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

export { TreeCombobox };
