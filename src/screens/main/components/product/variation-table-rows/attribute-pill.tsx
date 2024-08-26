import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import { Select, SelectContent, SelectItem, SelectPrimitive } from '@wcpos/components/src/select';

interface Props {
	attribute: import('@wcpos/database').ProductDocument['attributes'][number];
	selected: string;
	onSelect: (attribute: { name: string; option: string | null }) => void;
}

/**
 *
 */
export const VariationAttributePill = ({ attribute, onSelect, ...props }: Props) => {
	const [selected, setSelected] = React.useState(props.selected);
	const isActive = !!selected;

	/**
	 * @TODO - this works, but it's ugly as hell, need to choose controlled or uncontrolled
	 */
	React.useEffect(() => {
		setSelected(props.selected);
	}, [props.selected]);

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(option) => {
			setSelected(option);
			onSelect && onSelect({ name: attribute.name, option });
		},
		[attribute.name, onSelect]
	);

	/**
	 *
	 */
	const handleRemove = React.useCallback(() => {
		onSelect && onSelect({ name: attribute.name, option: null });
	}, [attribute.name, onSelect]);

	/**
	 * @TODO - if attribute options is less than 10, show select, otherwise show combobox
	 */
	return (
		<Select onValueChange={({ value }) => query.where('stock_status', value)}>
			<SelectPrimitive.Trigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="check"
					variant={isActive ? 'default' : 'secondary'}
					removable={isActive}
					onRemove={handleRemove}
				>
					<ButtonText>{`${attribute.name}: ${selected}` || attribute.name}</ButtonText>
				</ButtonPill>
			</SelectPrimitive.Trigger>
			<SelectContent>
				{attribute.options.map((option) => (
					<SelectItem key={option} label={option} value={option} />
				))}
			</SelectContent>
		</Select>
	);
};
