import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useControllableState } from '@rn-primitives/hooks';
import * as PopoverPrimitive from '@rn-primitives/popover';
import { ScrollView as GestureHandlerScrollView } from 'react-native-gesture-handler';

import { Platform } from '@wcpos/utils/platform';

import { Checkbox } from '../checkbox';
import { Icon } from '../icon';
import { Input } from '../input';
import { useArrowKeyNavigation } from '../lib/use-arrow-key-navigation';
import { applyCascadeToggle, useHierarchy } from '../lib/use-hierarchy';
import {
	getNativeListHeight,
	NATIVE_LIST_MAX_HEIGHT,
	NATIVE_POPOVER_MAX_HEIGHT,
	usePhoneSheetMetrics,
} from '../lib/native-popover-sizing';
import { useIsPhone } from '../lib/device';
import { OVERLAY_MOTION, OVERLAY_PANEL, OverlaySheetPanel, OverlayShell } from '../lib/overlay';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';
import * as VirtualizedListPrimitive from '../virtualized-list';

import type { FlatTreeItem } from '../lib/use-hierarchy';
import type { TreeComboboxContentProps, TreeComboboxProps } from './types';

const INDENT_PX = 16;

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
	searchResetKey: number;
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
	const [searchResetKey, setSearchResetKey] = React.useState(0);
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
			((v: ComboboxOption | ComboboxOption[] | undefined) => void) | undefined,
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
			return {
				value: id,
				label: node?.label ?? fallbackLabel,
				item: node?.item,
			};
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
		if (!open) {
			setFilterValue('');
			setSearchResetKey((key) => key + 1);
		}
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
			searchResetKey,
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
			searchResetKey,
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
	const { open } = PopoverPrimitive.useRootContext();

	const handleLayout = React.useCallback(
		(e: import('react-native').LayoutChangeEvent) => {
			setTriggerWidth(e.nativeEvent.layout.width);
			onLayout?.(e);
		},
		[setTriggerWidth, onLayout]
	);

	return (
		<PopoverPrimitive.Trigger
			className={cn(
				className,
				open && 'border-ring',
				disabled && 'web:cursor-not-allowed opacity-45'
			)}
			disabled={disabled}
			onLayout={handleLayout}
			{...props}
		/>
	);
}

// --- Value ---

interface TreeComboboxValueProps {
	/** The text the closed control shows: the selection, or the placeholder when `hasValue` is false. */
	children: string;
	hasValue: boolean;
	className?: string;
}

/**
 * The closed face of the control: the same value box `ComboboxValue` draws, so a
 * category picker and a customer picker read as one control. Reads the popover's
 * `open` so the visible border lights up while the tree is open.
 */
function TreeComboboxValue({ children, hasValue, className }: TreeComboboxValueProps) {
	const { open } = PopoverPrimitive.useRootContext();
	return (
		<View
			className={cn(
				'border-border bg-card h-ctl w-full flex-row items-center rounded-lg border px-3',
				open && 'border-ring',
				className
			)}
		>
			<View className="flex-1">
				<Text
					className={cn('text-base', hasValue ? 'text-foreground' : 'text-muted-foreground')}
					numberOfLines={1}
					decodeHtml
				>
					{children}
				</Text>
			</View>
			<Icon name="chevronDown" className="text-muted-foreground" />
		</View>
	);
}

// --- Content ---

function TreeComboboxSearchInput({
	onFilterChange,
	placeholder,
}: {
	onFilterChange: (value: string) => void;
	placeholder: string;
}) {
	const [inputValue, setInputValue] = React.useState('');

	const handleChange = React.useCallback(
		(text: string) => {
			setInputValue(text);
			onFilterChange(text);
		},
		[onFilterChange]
	);

	return (
		<Input
			autoFocus
			value={inputValue}
			onChangeText={handleChange}
			placeholder={placeholder}
			testID="tree-combobox-search"
			className="mb-2"
		/>
	);
}

function TreeComboboxContent<T>({
	children,
	portalHost,
	className,
	matchWidth,
	inline,
	searchPlaceholder = 'Search...',
	emptyMessage = 'No results found',
	estimatedItemSize = 36,
	renderItem,
}: TreeComboboxContentProps<T> & { inline?: boolean }) {
	const ctx = useTreeComboboxContext();
	const widthCtx = React.useContext(TreeComboboxWidthContext);
	const { open, onOpenChange } = PopoverPrimitive.useRootContext();
	const phone = useIsPhone();
	const sheet = usePhoneSheetMetrics();
	const isNative = Platform.OS !== 'web';
	const isAndroid = Platform.OS === 'android';

	useArrowKeyNavigation();

	const contentStyle = React.useMemo(() => {
		const widthStyle =
			matchWidth && widthCtx.triggerWidth ? { width: widthCtx.triggerWidth } : undefined;
		if (!isNative) return widthStyle;
		return { ...widthStyle, maxHeight: NATIVE_POPOVER_MAX_HEIGHT };
	}, [isNative, matchWidth, widthCtx.triggerWidth]);

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
							// Keyed by the option's VALUE, not its label: the labels are server-supplied
							// and localized, and E2E may not select by text (see the repo's E2E selector
							// policy). Only one tree popover can be open at a time, so the value alone
							// addresses the row unambiguously.
							testID={`tree-combobox-item-${flatItem.value}`}
							className="web:outline-none web:cursor-default web:focus:bg-muted web:hover:bg-muted active:bg-muted min-h-row relative flex flex-1 flex-row items-center gap-2 rounded-md px-2.5 py-1.5"
						>
							{ctx.multiple ? (
								<Checkbox
									checked={selected}
									onCheckedChange={() => handlePress()}
									className="pointer-events-none"
								/>
							) : (
								<View className="h-4 w-4 items-center justify-center">
									{selected && <Icon name="check" className="text-primary" size="xs" />}
								</View>
							)}
							<View className="flex-1">
								<Text className="text-foreground text-base" decodeHtml>
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
								testID={`tree-combobox-toggle-${flatItem.value}`}
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

	const content = (
		<>
			{children}
			<TreeComboboxSearchInput
				key={ctx.searchResetKey}
				onFilterChange={ctx.onFilterChange}
				placeholder={searchPlaceholder}
			/>
			{ctx.displayItems.length > 0 ? (
				isNative ? (
					<View
						style={{
							height: getNativeListHeight(
								ctx.displayItems.length,
								estimatedItemSize,
								phone ? sheet.listMaxHeight : NATIVE_LIST_MAX_HEIGHT
							),
							maxHeight: phone ? sheet.listMaxHeight : NATIVE_LIST_MAX_HEIGHT,
						}}
					>
						<VirtualizedListPrimitive.Root className="flex-1">
							<VirtualizedListPrimitive.List
								data={ctx.displayItems}
								estimatedItemSize={estimatedItemSize}
								renderItem={renderTreeItem as any}
								parentProps={{ style: { height: '100%' } }}
								renderScrollComponent={isAndroid ? GestureHandlerScrollView : undefined}
							/>
						</VirtualizedListPrimitive.Root>
					</View>
				) : (
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
				)
			) : (
				ctx.isSearching && (
					<View className="px-2 py-1.5">
						<Text className="text-foreground text-base">{emptyMessage}</Text>
					</View>
				)
			)}
		</>
	);
	// Native full-bleed accessibility wrapper: see lib/overlay.tsx.
	const shell = (
		<OverlayShell
			presentation={phone ? 'bottom' : 'anchored'}
			open={open}
			Scrim={PopoverPrimitive.Overlay}
			onDismiss={phone ? () => onOpenChange(false) : undefined}
		>
			<TextClassContext.Provider value="text-foreground">
				{phone ? (
					<OverlaySheetPanel
						className={className}
						// The shell pads the safe area; the panel adds only its own inset.
						style={{ maxHeight: sheet.maxHeight }}
					>
						{content}
					</OverlaySheetPanel>
				) : (
					<PopoverPrimitive.Content
						align="center"
						sideOffset={4}
						style={contentStyle}
						className={cn(
							OVERLAY_PANEL.anchored,
							'web:cursor-auto web:outline-none z-50 max-h-75 w-80',
							open ? OVERLAY_MOTION.anchored.enter : OVERLAY_MOTION.anchored.exit,
							className
						)}
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

export {
	TreeCombobox,
	TreeComboboxTrigger,
	TreeComboboxValue,
	TreeComboboxContent,
	useTreeComboboxContext,
};
