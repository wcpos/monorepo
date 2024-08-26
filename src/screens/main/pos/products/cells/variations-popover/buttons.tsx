import * as React from 'react';

import { Text } from '@wcpos/components/src/text';
import { ToggleGroup, ToggleGroupItem } from '@wcpos/components/src/toggle-group';

/**
 *
 */
const VariationButtons = ({ attribute, onSelect, selectedOption }) => {
	return (
		<ToggleGroup value={selectedOption} onValueChange={onSelect} type="single">
			{attribute.options?.map((option) => (
				<ToggleGroupItem
					key={option}
					value={option}
					// type={option === selectedOption ? 'success' : 'secondary'}
					// onPress={() => onSelect(attribute, option === selectedOption ? null : option)}
				>
					<Text>{option}</Text>
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
};

export default VariationButtons;
