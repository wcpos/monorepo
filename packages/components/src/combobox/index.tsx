import * as React from 'react';

import * as SelectPrimitive from '@rn-primitives/select';

import { Command, CommandEmpty, CommandInput, CommandList, CommandItem } from '../command';
import { Select, SelectContent } from '../select';

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

const ComboboxItem = (props: React.ComponentProps<typeof CommandItem>) => {
	const { onValueChange, onOpenChange } = useRootContext();
	const handleSelect = React.useCallback(
		(value) => {
			if (props.onSelect) {
				props.onSelect(value);
			} else {
				onValueChange({ value });
			}
			onOpenChange(false);
		},
		[onOpenChange, onValueChange, props]
	);
	return <CommandItem {...props} onSelect={handleSelect} />;
};
ComboboxItem.displayName = 'ItemWebCombobox';

const ComboboxEmpty = CommandEmpty;
ComboboxEmpty.displayName = 'EmptyWebCombobox';

const ComboboxTriggerPrimitive = SelectPrimitive.Trigger;

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
};
