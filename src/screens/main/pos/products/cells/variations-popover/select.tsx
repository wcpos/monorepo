import * as React from 'react';

import {
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
	ComboboxSearch,
} from '@wcpos/components/src/combobox';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/src/select';

import { useT } from '../../../../../../contexts/translations';
/**
 *
 */
const VariationSelect = ({ attribute, onSelect, selected }) => {
	const t = useT();
	const options = attribute?.options || [];

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
			{options.length > 10 ? (
				<ComboboxContent>
					<ComboboxSearch>
						<ComboboxInput placeholder={t('Search Variations', { _tags: 'core' })} />
						<ComboboxEmpty>{t('No variation found', { _tags: 'core' })}</ComboboxEmpty>
						<ComboboxList>
							{options.map((option) => {
								return (
									<ComboboxItem key={option} value={option} label={option}>
										{option}
									</ComboboxItem>
								);
							})}
						</ComboboxList>
					</ComboboxSearch>
				</ComboboxContent>
			) : (
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option} label={option} value={option} />
					))}
				</SelectContent>
			)}
		</Select>
	);
};

export default VariationSelect;
