import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Select from '@wcpos/components/src/select';
import Text from '@wcpos/components/src/text';

import type { SelectionState, StateAttributeOption } from './variations.helpers';

interface Props {
	selectionState: SelectionState;
	onSelect: (attribute: SelectionState[number], option: StateAttributeOption) => void;
}

/**
 *
 */
const VariationButtons = ({ attribute, onSelect }) => {
	return (
		<Button.Group>
			{attribute.options?.map((option) => (
				<Button
					key={option.value}
					type={option.selected ? 'success' : 'secondary'}
					disabled={option.disabled}
					onPress={() => onSelect(attribute, option)}
				>
					{option.label}
				</Button>
			))}
		</Button.Group>
	);
};

const VariationSelect = ({ attribute, onSelect }) => {
	const selectedArray = attribute.options.filter((option) => option.selected);
	const selected = selectedArray.length === 1 ? selectedArray[0] : '';

	return (
		<Select
			value={selected}
			options={attribute.options}
			onChange={(option) =>
				onSelect(attribute, {
					label: option,
					value: option,
				})
			}
			placeholder="Select an option"
			/**
			 * FIXME: this might cause problems with z stacking in popovers?
			 * I need to redo the Portal component to properly handle click outside
			 */
			withinPortal={false}
		/>
	);
};

/**
 *
 */
export const Variations = ({ selectionState, onSelect }: Props) => {
	return (
		<Box space="xSmall">
			{selectionState.map((attribute) => {
				return (
					<Box key={attribute.name} space="xSmall">
						<Text>{attribute.name}</Text>
						{attribute.characterCount < 15 ? (
							<VariationButtons attribute={attribute} onSelect={onSelect} />
						) : (
							<VariationSelect attribute={attribute} onSelect={onSelect} />
						)}
					</Box>
				);
			})}
		</Box>
	);
};
