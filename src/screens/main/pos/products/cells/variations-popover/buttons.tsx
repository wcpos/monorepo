import * as React from 'react';

import Button from '@wcpos/components/src/button';

/**
 *
 */
const VariationButtons = ({ attribute, onSelect, selectedOption }) => {
	return (
		<Button.Group>
			{attribute.options?.map((option) => (
				<Button
					key={option}
					type={option === selectedOption ? 'success' : 'secondary'}
					onPress={() => onSelect(attribute, option === selectedOption ? null : option)}
				>
					{option}
				</Button>
			))}
		</Button.Group>
	);
};

export default VariationButtons;
