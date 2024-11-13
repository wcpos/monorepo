import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import {
	Combobox,
	ComboboxTriggerPrimitive,
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
	SelectPrimitiveTrigger,
} from '@wcpos/components/src/select';
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
						variant={isActive ? 'default' : 'muted'}
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
			<ComboboxTriggerPrimitive asChild>
				<ButtonPill
					size="xs"
					leftIcon="check"
					variant={isActive ? 'default' : 'muted'}
					removable={isActive}
					onRemove={onRemove}
				>
					<ButtonText>{isActive ? `${attribute.name}: ${selected}` : attribute.name}</ButtonText>
				</ButtonPill>
			</ComboboxTriggerPrimitive>
			<ComboboxContent>
				<ComboboxSearch>
					<ComboboxInput placeholder={t('Search Variations', { _tags: 'core' })} />
					<ComboboxEmpty>{t('No variation found', { _tags: 'core' })}</ComboboxEmpty>
					<ComboboxList>
						{options.map((option, index) => {
							return (
								<ComboboxItem key={index} value={option} label={option}>
									{option}
								</ComboboxItem>
							);
						})}
					</ComboboxList>
				</ComboboxSearch>
			</ComboboxContent>
		</Combobox>
	);
};
