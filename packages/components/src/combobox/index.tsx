import * as React from 'react';

import * as SelectPrimitive from '@rn-primitives/select';

import { Command, CommandEmpty, CommandInput, CommandList, CommandItem } from '../command';
import { Select, SelectContent, SelectTrigger, SelectValue } from '../select';

/**
 * We'll follow the same API as the `Select` component from `@rn-primitives/select`.
 */
const Combobox = Select;
Combobox.displayName = 'RootWebCombobox';

const useRootContext = SelectPrimitive.useRootContext;

const ComboboxContent = SelectContent;
ComboboxContent.displayName = 'ContentWebCombobox';

const ComboboxSearch = Command;
ComboboxSearch.displayName = 'SearchWebCombobox';

const ComboboxInput = CommandInput;
ComboboxInput.displayName = 'InputWebCombobox';

const ComboboxList = CommandList;
ComboboxList.displayName = 'ListWebCombobox';

/**
 * We'll follow the same API as the `Select.Item` component from `@rn-primitives/select`.
 */
const ComboboxItem = (props: React.ComponentProps<typeof CommandItem> & { label: string }) => {
	const { value = '', label = '', children } = props;
	const { onValueChange, onOpenChange } = useRootContext();

	/**
	 * Handle the `onSelect` event from the `CommandItem` component.
	 * If the `onSelect` prop is provided, we'll call it with the `value`.
	 * Otherwise, we'll call the `onValueChange` with the `value` and `label`, like the `Select.Item` component.
	 */
	const handleSelect = React.useCallback(() => {
		if (props.onSelect) {
			props.onSelect(value);
		} else {
			onValueChange({ value, label });
		}
		onOpenChange(false);
	}, [label, onOpenChange, onValueChange, props, value]);

	/**
	 * Note: we need to pass the `label` and `value` as keywords to the `CommandItem` component for filtering
	 */
	return (
		<CommandItem {...props} onSelect={handleSelect} keywords={[label, value]}>
			{children ?? label}
		</CommandItem>
	);
};
ComboboxItem.displayName = 'ItemWebCombobox';

const ComboboxEmpty = CommandEmpty;
ComboboxEmpty.displayName = 'EmptyWebCombobox';

const ComboboxTriggerPrimitive = SelectPrimitive.Trigger;

const ComboboxTrigger = SelectTrigger;
ComboboxTrigger.displayName = 'TriggerWebCombobox';

// const ComboboxValue = (props: React.ComponentProps<typeof SelectValue>) => {
// 	return <SelectValue {...props} />;
// };
const ComboboxValue = SelectValue;
ComboboxValue.displayName = 'ValueWebCombobox';

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
	ComboboxValue,
	ComboboxTrigger,
};
