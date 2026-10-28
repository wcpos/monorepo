import * as React from 'react';

import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemText,
	ComboboxList,
	ComboboxTrigger,
	ComboboxValue,
} from './combobox';
import { OptionSelect, type OptionSelectProps } from '../select';

/** A list a cashier can scan at a glance is a Select; past this it needs a search box. */
const SEARCHABLE_AFTER = 10;

export type OptionsComboboxProps = OptionSelectProps & {
	searchPlaceholder: string;
	emptyLabel: string;
};

/**
 * `OptionSelect`'s searchable twin for a static list: the same props and testIDs (the trigger's
 * `triggerTestID`, each option `${triggerTestID}-option-${value}`, the list `-content`).
 * Ten options or fewer draw the `OptionSelect` itself.
 */
export function OptionsCombobox({ searchPlaceholder, emptyLabel, ...props }: OptionsComboboxProps) {
	if (props.options.length <= SEARCHABLE_AFTER) return <OptionSelect {...props} />;
	const { options, value, onChange, fallbackLabel, triggerTestID: id, disabled } = props;
	const label = options.find((option) => option.value === value)?.label ?? fallbackLabel ?? '';
	return (
		<Combobox value={{ value: value ?? '', label }} onValueChange={(o) => onChange?.(o?.value, o)}>
			<ComboboxTrigger testID={id} disabled={disabled} aria-labelledby={props['aria-labelledby']}>
				<ComboboxValue placeholder={props.placeholder} />
			</ComboboxTrigger>
			<ComboboxContent testID={id && `${id}-content`} portalHost={props.portalHost}>
				<ComboboxInput placeholder={searchPlaceholder} />
				<ComboboxList
					data={options}
					renderItem={({ item }) => (
						<ComboboxItem {...item} item={item} testID={id && `${id}-option-${item.value}`}>
							<ComboboxItemText />
						</ComboboxItem>
					)}
					estimatedItemSize={44}
					ListEmptyComponent={<ComboboxEmpty>{emptyLabel}</ComboboxEmpty>}
				/>
			</ComboboxContent>
		</Combobox>
	);
}
