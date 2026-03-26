import * as React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { useControllableState } from '@rn-primitives/hooks';
import * as PopoverPrimitive from '@rn-primitives/popover';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Checkbox } from '../checkbox';
import { applyCascadeToggle, useHierarchy } from '../lib/use-hierarchy';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';
import { TreeItemRow } from './tree-item';

import type { FlatTreeItem, TreeNode } from '../lib/use-hierarchy';
import type { TreeSelectMultiProps, TreeSelectProps, TreeSelectSingleProps } from './types';

type SelectOption = { value: string; label: string };

// ─── TreeSelect ──────────────────────────────────────────────────────────

function TreeSelect<T = undefined>(props: TreeSelectProps<T>) {
	if (props.multiple) {
		return <TreeSelectMulti {...props} />;
	}
	return <TreeSelectSingle {...props} />;
}

// ─── Single-select ───────────────────────────────────────────────────────

function TreeSelectSingle<T>({
	options,
	value: valueProp,
	defaultValue,
	onValueChange: onValueChangeProp,
	placeholder = 'Select…',
	disabled,
	portalHost,
	className,
	maxDepth,
	parentSelectable = true,
	defaultExpanded = 'none',
	expandedIds: expandedIdsProp,
	onExpandChange,
	renderItem,
}: TreeSelectSingleProps<T>) {
	const [value, onValueChange] = useControllableState<SelectOption | undefined>({
		prop: valueProp,
		defaultProp: defaultValue,
		onChange: onValueChangeProp,
	});

	const hierarchy = useHierarchy(options, {
		maxDepth,
		defaultExpanded,
		expandedIds: expandedIdsProp,
		onExpandChange,
		parentSelectable,
	});

	const displayText = value?.label ?? placeholder;
	const hasValue = value !== undefined;

	return (
		<PopoverPrimitive.Root>
			<PopoverPrimitive.Trigger
				className={cn(disabled && 'web:cursor-not-allowed opacity-50', className)}
				disabled={disabled}
			>
				<TextClassContext.Provider
					value={cn('text-sm', hasValue ? 'text-foreground' : 'text-muted-foreground')}
				>
					<Text>{displayText}</Text>
				</TextClassContext.Provider>
			</PopoverPrimitive.Trigger>

			<TreeSelectContent portalHost={portalHost}>
				<ScrollView style={{ maxHeight: 300 }}>
					{hierarchy.visibleItems.map((item) => {
						const isSelected = value?.value === item.value;
						const isSelectable = parentSelectable || !item.hasChildren;

						const defaultRender = () => (
							<TreeSelectSingleItem
								key={item.value}
								item={item}
								isSelected={isSelected}
								isSelectable={isSelectable}
								onSelect={(option) => {
									onValueChange(option);
								}}
								onToggle={hierarchy.toggle}
							/>
						);

						if (renderItem) {
							return (
								<React.Fragment key={item.value}>
									{renderItem(item as FlatTreeItem<T>, defaultRender)}
								</React.Fragment>
							);
						}

						return defaultRender();
					})}
				</ScrollView>
			</TreeSelectContent>
		</PopoverPrimitive.Root>
	);
}

// ─── Multi-select ────────────────────────────────────────────────────────

function TreeSelectMulti<T>({
	options,
	value: valueProp,
	defaultValue,
	onValueChange: onValueChangeProp,
	placeholder = 'Select…',
	disabled,
	portalHost,
	className,
	maxDepth,
	parentSelectable = true,
	defaultExpanded = 'none',
	expandedIds: expandedIdsProp,
	onExpandChange,
	cascadeSelection = false,
	renderItem,
}: TreeSelectMultiProps<T>) {
	const [value, onValueChange] = useControllableState<SelectOption[]>({
		prop: valueProp,
		defaultProp: defaultValue ?? [],
		onChange: onValueChangeProp,
	});

	const hierarchy = useHierarchy(options, {
		maxDepth,
		defaultExpanded,
		expandedIds: expandedIdsProp,
		onExpandChange,
		parentSelectable,
		cascadeSelection,
	});

	const selectedValues = value ?? [];
	const displayText =
		selectedValues.length > 0 ? selectedValues.map((v) => v.label).join(', ') : placeholder;
	const hasValue = selectedValues.length > 0;

	const isSelected = React.useCallback(
		(targetValue: string) => selectedValues.some((option) => option.value === targetValue),
		[selectedValues]
	);

	const handleToggle = React.useCallback(
		(option: SelectOption) => {
			if (cascadeSelection) {
				const next = applyCascadeToggle(
					selectedValues,
					option.value,
					hierarchy.nodeMap as Map<string, TreeNode<undefined>>
				);
				(onValueChange as (options: SelectOption[]) => void)(next);
			} else {
				const exists = selectedValues.some((v) => v.value === option.value);
				const next = exists
					? selectedValues.filter((v) => v.value !== option.value)
					: [...selectedValues, option];
				(onValueChange as (options: SelectOption[]) => void)(next);
			}
		},
		[cascadeSelection, selectedValues, hierarchy.nodeMap, onValueChange]
	);

	return (
		<PopoverPrimitive.Root>
			<PopoverPrimitive.Trigger
				className={cn(disabled && 'web:cursor-not-allowed opacity-50', className)}
				disabled={disabled}
			>
				<TextClassContext.Provider
					value={cn('text-sm', hasValue ? 'text-foreground' : 'text-muted-foreground')}
				>
					<Text numberOfLines={1}>{displayText}</Text>
				</TextClassContext.Provider>
			</PopoverPrimitive.Trigger>

			<TreeSelectContent portalHost={portalHost}>
				<ScrollView style={{ maxHeight: 300 }}>
					{hierarchy.visibleItems.map((item) => {
						const selected = isSelected(item.value);
						const isSelectable = parentSelectable || !item.hasChildren;

						const defaultRender = () => (
							<TreeSelectMultiItem
								key={item.value}
								item={item}
								isSelected={selected}
								isSelectable={isSelectable}
								onToggle={hierarchy.toggle}
								onSelect={handleToggle}
							/>
						);

						if (renderItem) {
							return (
								<React.Fragment key={item.value}>
									{renderItem(item as FlatTreeItem<T>, defaultRender)}
								</React.Fragment>
							);
						}

						return defaultRender();
					})}
				</ScrollView>
			</TreeSelectContent>
		</PopoverPrimitive.Root>
	);
}

// ─── Shared Content wrapper ──────────────────────────────────────────────

function TreeSelectContent({
	children,
	portalHost,
	align = 'start',
	sideOffset = 4,
	className,
	...props
}: PopoverPrimitive.ContentProps & { portalHost?: string }) {
	const { open } = PopoverPrimitive.useRootContext();

	if (!open) return null;

	return (
		<PopoverPrimitive.Portal hostName={portalHost}>
			<PopoverPrimitive.Overlay style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}>
				<Animated.View entering={FadeIn.duration(200)} exiting={FadeOut}>
					<TextClassContext.Provider value="text-popover-foreground">
						<PopoverPrimitive.Content
							align={align}
							sideOffset={sideOffset}
							className={cn(
								'border-border bg-popover web:data-[side=bottom]:slide-in-from-top-2 web:data-[side=left]:slide-in-from-right-2 web:data-[side=right]:slide-in-from-left-2 web:data-[side=top]:slide-in-from-bottom-2 web:animate-in web:zoom-in-95 web:fade-in-0 z-50 max-h-96 min-w-32 rounded-md border px-1 py-2 shadow-md',
								className
							)}
							{...props}
						>
							{children}
						</PopoverPrimitive.Content>
					</TextClassContext.Provider>
				</Animated.View>
			</PopoverPrimitive.Overlay>
		</PopoverPrimitive.Portal>
	);
}

// ─── Single-select item ──────────────────────────────────────────────────

function TreeSelectSingleItem<T>({
	item,
	isSelected,
	isSelectable,
	onSelect,
	onToggle,
}: {
	item: FlatTreeItem<T>;
	isSelected: boolean;
	isSelectable: boolean;
	onSelect: (option: SelectOption) => void;
	onToggle: (id: string) => void;
}) {
	const { onOpenChange } = PopoverPrimitive.useRootContext();

	const handlePress = React.useCallback(() => {
		if (!isSelectable) return;
		onSelect({ value: item.value, label: item.label });
		onOpenChange(false);
	}, [isSelectable, onSelect, item.value, item.label, onOpenChange]);

	return (
		<TreeItemRow item={item} onToggle={onToggle}>
			<Pressable
				onPress={handlePress}
				className={cn(
					'web:cursor-default web:select-none web:hover:bg-accent/50 web:outline-none web:focus:bg-accent active:bg-accent flex-1 flex-row items-center rounded-sm py-1.5 pr-2',
					isSelected && 'bg-accent',
					!isSelectable && 'opacity-60'
				)}
				disabled={!isSelectable}
			>
				<Text className="web:group-focus:text-accent-foreground text-popover-foreground text-sm">
					{item.label}
				</Text>
			</Pressable>
		</TreeItemRow>
	);
}

// ─── Multi-select item ───────────────────────────────────────────────────

function TreeSelectMultiItem<T>({
	item,
	isSelected,
	isSelectable,
	onSelect,
	onToggle,
}: {
	item: FlatTreeItem<T>;
	isSelected: boolean;
	isSelectable: boolean;
	onSelect: (option: SelectOption) => void;
	onToggle: (id: string) => void;
}) {
	const handlePress = React.useCallback(() => {
		if (!isSelectable) return;
		onSelect({ value: item.value, label: item.label });
	}, [isSelectable, onSelect, item.value, item.label]);

	return (
		<TreeItemRow item={item} onToggle={onToggle}>
			<Pressable
				onPress={handlePress}
				className={cn(
					'web:cursor-default web:select-none web:hover:bg-accent/50 web:outline-none web:focus:bg-accent active:bg-accent flex-1 flex-row items-center gap-2 rounded-sm py-1.5 pr-2',
					!isSelectable && 'opacity-60'
				)}
				disabled={!isSelectable}
			>
				<Checkbox
					checked={isSelected}
					onCheckedChange={() => handlePress()}
					className="pointer-events-none"
				/>
				<Text className="web:group-focus:text-accent-foreground text-popover-foreground text-sm">
					{item.label}
				</Text>
			</Pressable>
		</TreeItemRow>
	);
}

export { TreeSelect, TreeSelectContent, TreeSelectSingleItem, TreeSelectMultiItem };
