import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemText,
	ComboboxList,
	ComboboxTrigger,
} from '@wcpos/components/combobox';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/select';
import type { ProductDocument } from '@wcpos/database';

import { useT } from '../../../../contexts/translations';

interface Props {
	attribute: ProductDocument['attributes'][number];
	selected: string;
	onSelect: ({ id, name, option }: { id: number; name: string; option: string }) => void;
	onRemove: () => void;
}

/**
 *
 */
export const VariationSelect = ({ attribute, selected = '', onSelect, onRemove }: Props) => {
	const t = useT();
	const isActive = !!selected;
	const options = attribute?.options || [];
	const data = React.useMemo(
		() => options.map((option) => ({ value: option, label: option })),
		[options]
	);

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
				<SelectPrimitiveTrigger asChild>
					<ButtonPill
						size="xs"
						leftIcon="check"
						variant={isActive ? undefined : 'muted'}
						removable={isActive}
						onRemove={onRemove}
					>
						<ButtonText>{isActive ? `${attribute.name}: ${selected}` : attribute.name}</ButtonText>
					</ButtonPill>
				</SelectPrimitiveTrigger>
				<SelectContent>
					{options.map((option, index) => (
						<SelectItem key={index} label={option} value={option} />
					))}
				</SelectContent>
			</Select>
		);
	}

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
			<ComboboxTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="check"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={onRemove}
				>
					<ButtonText>{isActive ? `${attribute.name}: ${selected}` : attribute.name}</ButtonText>
				</ButtonPill>
			</ComboboxTrigger>
			<ComboboxContent>
				<ComboboxInput placeholder={t('Search Variations')} />
				<ComboboxList
					data={data}
					renderItem={({ item }) => (
						<ComboboxItem value={item.value} label={item.label}>
							<ComboboxItemText>{item.label}</ComboboxItemText>
						</ComboboxItem>
					)}
					estimatedItemSize={20}
					ListEmptyComponent={() => <ComboboxEmpty>{t('No variation found')}</ComboboxEmpty>}
				></ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
};
