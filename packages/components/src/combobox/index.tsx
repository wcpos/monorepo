import React from 'react';

import { FlatList } from 'react-native-gesture-handler';

import { Input } from '../input';
import { Text } from '../text';

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

const Combobox = () => {};

const ComboboxItem = () => {};
const ComboboxTrigger = () => {};
const ComboboxTriggerPrimitive = () => {};
const ComboboxContent = () => {};
const ComboboxValue = () => {};

/**
 * Remove this, just use ComboboxContent with search
 */
const ComboboxSearch = React.forwardRef<React.ElementRef<any>, React.ComponentPropsWithoutRef<any>>(
	({ className, children, ...props }, ref) => {
		return <>{children}</>;
	}
);
ComboboxSearch.displayName = 'ComboboxSearch';

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
