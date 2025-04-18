import React from 'react';
import { Platform, StyleSheet, FlatList, View } from 'react-native';

import * as SelectPrimitive from '@rn-primitives/select';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Input } from '../input';
import { cn } from '../lib/utils';
import * as Select from '../select';
import { Text } from '../text';
import { commandScore } from './fuzzy-search';

import type { Option } from '../select';
import type { TextProps } from '../text';

/**
 * const options = [
 *   { value: 'USD', label: 'United States Dollar' },
 *   { value: 'EUR', label: 'Euro' },
 *   { value: 'GBP', label: 'British Pound' },
 *   { value: 'CAD', label: 'Canadian Dollar' },
 *   { value: 'AUD', label: 'Australian Dollar' },
 * ]
 *
 * <Combobox value={{ value, label }} onValueChange={onValueChange}>
 *       <ComboboxTrigger>
 *           <ComboboxValue placeholder={t('Select Currency', { _tags: 'core' })} />
 *       </ComboboxTrigger>
 *       <ComboboxContent>
 *           <ComboboxInput placeholder={t('Search Currencies', { _tags: 'core' })} />
 *           <ComboboxList
 *             data={options}
 *             ListEmptyComponent={<ComboboxEmpty>{t('No currency found', { _tags: 'core' })}</ComboboxEmpty>}
 *           />
 *       </ComboboxContent>
 * </Combobox>
 */

const Combobox = SelectPrimitive.Root;
Combobox.displayName = 'Combobox';

const ComboboxTrigger = Select.SelectTrigger;
ComboboxTrigger.displayName = 'ComboboxTrigger';

const ComboboxTriggerPrimitive = SelectPrimitive.Trigger;
ComboboxTriggerPrimitive.displayName = 'ComboboxTriggerPrimitive';

const ComboboxValue = Select.SelectValue;
ComboboxValue.displayName = 'ComboboxValue';

const ComboboxItem = React.forwardRef<SelectPrimitive.ItemRef, SelectPrimitive.ItemProps>(
	({ className, children, ...props }, ref) => (
		<SelectPrimitive.Item
			ref={ref}
			className={cn(
				'native:py-2',
				'web:group web:cursor-default web:select-none web:hover:bg-accent/50 web:outline-none web:focus:bg-accent active:bg-accent',
				'relative flex w-full flex-row items-center rounded-sm px-2 py-1.5',
				props.disabled && 'web:pointer-events-none opacity-50',
				className
			)}
			{...props}
		>
			<SelectPrimitive.ItemText className="native:text-base web:group-focus:text-accent-foreground text-popover-foreground text-sm" />
		</SelectPrimitive.Item>
	)
);
ComboboxItem.displayName = 'ComboboxItem';

const ComboboxItemText = SelectPrimitive.ItemText;
ComboboxItemText.displayName = 'ComboboxItemText';

const useRootContext = SelectPrimitive.useRootContext;

/**
 * Remove this, just use ComboboxContent with search
 */
const ComboboxSearch = React.forwardRef<React.ElementRef<any>, React.ComponentPropsWithoutRef<any>>(
	({ className, children, ...props }, ref) => {
		return <>{children}</>;
	}
);
ComboboxSearch.displayName = 'ComboboxSearch';

const ComboboxContent = React.forwardRef<
	SelectPrimitive.ContentRef,
	SelectPrimitive.ContentProps & { portalHost?: string }
>(({ className, children, position = 'popper', portalHost, ...props }, ref) => {
	const { open } = SelectPrimitive.useRootContext();

	/**
	 * FIXME: I thought the SelectPrimitive.Content already handled mounting and unmounting via Radix presence.
	 * However, select contents are being rendered on page load, which is not what we want.
	 */
	if (!open) return null;

	return (
		<SelectPrimitive.Portal hostName={portalHost}>
			<SelectPrimitive.Overlay style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}>
				<Animated.View
					className="z-50"
					// FIXME: There's a weird thing when the content is being unmounted, it flashes before it's removed.
					// entering={FadeIn}
					// exiting={FadeOut}
				>
					<SelectPrimitive.Content
						ref={ref}
						className={cn(
							'border-border bg-popover shadow-foreground/10 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-96 min-w-[8rem] rounded-md border px-1 py-2 shadow-md',
							position === 'popper' &&
								'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
							open
								? 'web:zoom-in-95 web:animate-in web:fade-in-0'
								: 'web:zoom-out-95 web:animate-out web:fade-out-0',
							className
						)}
						position={position}
						{...props}
					>
						<SelectPrimitive.Viewport
							className={cn(
								'flex flex-col gap-2 p-1',
								position === 'popper' &&
									'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
							)}
						>
							{children}
						</SelectPrimitive.Viewport>
					</SelectPrimitive.Content>
				</Animated.View>
			</SelectPrimitive.Overlay>
		</SelectPrimitive.Portal>
	);
});
ComboboxContent.displayName = 'ComboboxContent';

/**
 *
 */
const ComboboxInput = React.forwardRef<
	React.ElementRef<typeof Input>,
	React.ComponentPropsWithoutRef<typeof Input>
>(({ className, ...props }, ref) => {
	return <Input ref={ref} autoFocus={Platform.OS === 'web'} clearable {...props} />;
});
ComboboxInput.displayName = 'ComboboxInput';

/**
 *
 */
const ComboboxList = React.forwardRef<
	React.ElementRef<typeof FlatList>,
	React.ComponentPropsWithoutRef<typeof FlatList>
>(({ className, data, renderItem: customRenderItem, ...props }, ref) => {
	const defaultRenderItem = ({ item }) => <ComboboxItem value={item.value} label={item.label} />;

	return (
		<FlatList
			ref={ref}
			data={data}
			keyExtractor={(item, index) => {
				if (item.value === undefined || item.value === '') {
					return `item-${index}`;
				}
				return String(item.value);
			}}
			renderItem={customRenderItem || defaultRenderItem}
			style={{ maxHeight: 200 }}
			{...props}
		/>
	);
});
ComboboxList.displayName = 'ComboboxList';

/**
 *
 */
const ComboboxEmpty = React.forwardRef<Text, TextProps>((props, ref) => (
	<View className="px-2 py-1.5">
		<Text ref={ref} {...props} />
	</View>
));
ComboboxEmpty.displayName = 'ComboboxEmpty';

const useComboboxContext = () => {};

const comboboxFilter = (items: Option[], query: string, threshold = 0.1): Option[] => {
	return (
		items
			.map((item) => ({
				item,
				// Use the label as the primary string and the value as an alias
				score: commandScore(item.label, query, [item.value]),
			}))
			// Filter out items with scores below the threshold
			.filter(({ score }) => score > threshold)
			// Sort descending by score
			.sort((a, b) => b.score - a.score)
			.map(({ item }) => item)
	);
};

export {
	Combobox,
	ComboboxContent,
	ComboboxSearch,
	ComboboxInput,
	ComboboxList,
	ComboboxEmpty,
	ComboboxTriggerPrimitive,
	ComboboxItem,
	useRootContext,
	useComboboxContext,
	ComboboxValue,
	ComboboxTrigger,
	comboboxFilter,
};
