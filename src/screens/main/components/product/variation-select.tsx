import * as React from 'react';

import { ProductDocument } from '@wcpos/database';
import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';
import { Select, SelectContent, SelectItem, SelectPrimitive } from '@wcpos/tailwind/src/select';

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

	/**
	 *
	 */
	return (
		<Select
			value={{ value: selected, label: selected }}
			onValueChange={({ value }) =>
				onSelect({ id: attribute.id, name: attribute.name, option: value })
			}
		>
			<SelectPrimitive.Trigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="check"
					variant={isActive ? 'default' : 'muted'}
					removable={isActive}
					onRemove={onRemove}
				>
					<ButtonText>{isActive ? `${attribute.name}: ${selected}` : attribute.name}</ButtonText>
				</ButtonPill>
			</SelectPrimitive.Trigger>
			<SelectContent>
				{(attribute.options || []).map((option) => (
					<SelectItem key={option} label={option} value={option} />
				))}
			</SelectContent>
		</Select>
	);
};
