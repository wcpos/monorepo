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
} from '@wcpos/components/combobox';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';

import { useT } from '../../../../../../contexts/translations';
/**
 *
 */
const VariationSelect = ({ attribute, onSelect, selected }) => {
	const t = useT();
	const options = attribute?.options || [];

	/**
	 * Select for short list of options
	 */

	if (options.length <= 10) {
		return (
			<Select
				value={{ value: selected, label: selected }}
				onValueChange={({ value }) =>
					onSelect({ id: attribute.id, name: attribute.name, option: value })
				}
			>
				<SelectTrigger>
					<SelectValue placeholder={t('Select an option', { _tags: 'core' })} />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option} label={option} value={option} />
					))}
				</SelectContent>
			</Select>
		);
	}

	const data = options.map((option) => {
		return {
			value: option,
			label: option,
		};
	});

	/**
	 * Combobox for longer list of options
	 */
	return (
		<Combobox
			value={{ value: selected, label: selected }}
			onValueChange={({ value }) =>
				onSelect({ id: attribute.id, name: attribute.name, option: value })
			}
		>
			<ComboboxTrigger>
				<ComboboxValue placeholder={t('Select an option', { _tags: 'core' })} />
			</ComboboxTrigger>
			<ComboboxContent>
				<ComboboxInput placeholder={t('Search Variations', { _tags: 'core' })} />
				<ComboboxList
					data={data}
					renderItem={({ item }) => (
						<ComboboxItem value={item.value} label={item.label}>
							<ComboboxItemText>{item.label}</ComboboxItemText>
						</ComboboxItem>
					)}
					estimatedItemSize={44}
					ListEmptyComponent={
						<ComboboxEmpty>{t('No variation found', { _tags: 'core' })}</ComboboxEmpty>
					}
				/>
			</ComboboxContent>
		</Combobox>
	);
};

export default VariationSelect;
