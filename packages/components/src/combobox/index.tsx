import React from 'react';
import { Platform, StyleSheet } from 'react-native';

import * as SelectPrimitive from '@rn-primitives/select';
import { FlatList } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Input } from '../input';
import { Text } from '../text';
import * as ComboboxPrimitive from './primitives';
import { cn } from '../lib/utils';

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
 * <Combobox ref={ref} value={{ value, label }} onValueChange={onValueChange}>
 *       <ComboboxTrigger>
 *           <ComboboxValue placeholder={t('Select Currency', { _tags: 'core' })} />
 *       </ComboboxTrigger>
 *       <ComboboxContent>
 *           <ComboboxSearch>
 *               <ComboboxInput placeholder={t('Search Currencies', { _tags: 'core' })} />
 *               <ComboboxEmpty>{t('No currency found', { _tags: 'core' })}</ComboboxEmpty>
 *               <ComboboxList data={options} />
 *           </ComboboxSearch>
 *       </ComboboxContent>
 * </Combobox>
 */

const Combobox = ComboboxPrimitive.Root;
const ComboboxTrigger = ComboboxPrimitive.Trigger;
const ComboboxTriggerPrimitive = ComboboxPrimitive.Trigger;
const ComboboxValue = ComboboxPrimitive.Value;
const ComboboxItem = ComboboxPrimitive.Item;

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
	const { open } = ComboboxPrimitive.useRootContext();

	return (
		<ComboboxPrimitive.Portal hostName={portalHost}>
			<ComboboxPrimitive.Overlay
				style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}
			>
				<Animated.View className="z-50" entering={FadeIn} exiting={FadeOut}>
					<ComboboxPrimitive.Content
						ref={ref}
						className={cn(
							'border-border bg-popover shadow-foreground/10 relative z-50 max-h-96 min-w-[8rem] rounded-md border px-1 py-2 shadow-md',
							'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
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
						<ComboboxPrimitive.Viewport
							className={cn(
								'p-1',
								position === 'popper' &&
									'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
							)}
						>
							{children}
						</ComboboxPrimitive.Viewport>
					</ComboboxPrimitive.Content>
				</Animated.View>
			</ComboboxPrimitive.Overlay>
		</ComboboxPrimitive.Portal>
	);
});
ComboboxContent.displayName = ComboboxPrimitive.Content.displayName;

/**
 *
 */
const ComboboxInput = React.forwardRef<
	React.ElementRef<typeof Input>,
	React.ComponentPropsWithoutRef<typeof Input>
>(({ className, ...props }, ref) => {
	return <Input ref={ref} autoFocus {...props} />;
});
ComboboxInput.displayName = 'ComboboxInput';

/**
 *
 */
const ComboboxList = React.forwardRef<
	React.ElementRef<typeof FlatList>,
	React.ComponentPropsWithoutRef<typeof FlatList>
>(({ className, data, renderItem: customRenderItem, ...props }, ref) => {
	const defaultRenderItem = ({ item }) => (
		<ComboboxItem value={item.value}>{item.label}</ComboboxItem>
	);

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
			{...props}
		/>
	);
});
ComboboxList.displayName = 'ComboboxList';

/**
 *
 */
const ComboboxEmpty = React.forwardRef<Text, TextProps>((props, ref) => (
	<Text ref={ref} {...props} />
));
ComboboxEmpty.displayName = 'ComboboxEmpty';

const useRootContext = () => {};
const useComboboxContext = () => {};

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
};
