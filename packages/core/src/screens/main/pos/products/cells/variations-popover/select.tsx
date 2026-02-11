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

interface VariationSelectProps {
	attribute: {
		id?: number;
		name?: string;
		options?: string[];
	};
	onSelect: (attr: { id?: number; name?: string; option: string }) => void;
	selected?: string;
}

/**
 *
 */
export function VariationSelect({ attribute, onSelect, selected }: VariationSelectProps) {
	const t = useT();
	const options = attribute?.options || [];

	/**
	 * Select for short list of options
	 */

	if (options.length <= 10) {
		return (
			<Select
				value={selected ? { value: selected, label: selected } : undefined}
				onValueChange={(option) => {
					if (option) {
						onSelect({ id: attribute.id, name: attribute.name, option: option.value });
					}
				}}
			>
				<SelectTrigger>
					<SelectValue placeholder={t('pos_products.select_an_option')} />
				</SelectTrigger>
				<SelectContent>
					{options.map((option: string) => (
						<SelectItem key={option} label={option} value={option} />
					))}
				</SelectContent>
			</Select>
		);
	}

	const data = options.map((option: string) => {
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
			value={selected ? { value: selected, label: selected } : undefined}
			onValueChange={(option) => {
				if (option) {
					onSelect({ id: attribute.id, name: attribute.name, option: String(option.value) });
				}
			}}
		>
			<ComboboxTrigger>
				<ComboboxValue placeholder={t('pos_products.select_an_option')} />
			</ComboboxTrigger>
			<ComboboxContent>
				<ComboboxInput placeholder={t('common.search_variations')} />
				<ComboboxList
					data={data}
					renderItem={({ item }) => (
						<ComboboxItem value={String(item.value)} label={item.label} item={item}>
							<ComboboxItemText />
						</ComboboxItem>
					)}
					estimatedItemSize={44}
					ListEmptyComponent={<ComboboxEmpty>{t('common.no_variation_found')}</ComboboxEmpty>}
				/>
			</ComboboxContent>
		</Combobox>
	);
}
