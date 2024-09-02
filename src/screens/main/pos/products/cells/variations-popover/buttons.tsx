import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/src/text';
import { ToggleGroup, ToggleGroupItem } from '@wcpos/components/src/toggle-group';

/**
 *
 */
const VariationButtons = ({ attribute, onSelect, selectedOption = '' }) => {
	const [value, setValue] = React.useState<string>(selectedOption);

	/**
	 *
	 */
	const handleSelect = (option: string) => {
		setValue(option);
		onSelect && onSelect(option);
	};

	return (
		<View className="flex-row">
			<ToggleGroup value={value} onValueChange={handleSelect} type="single">
				{attribute.options?.map((option) => (
					<ToggleGroupItem key={option} value={option}>
						<Text>{option}</Text>
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</View>
	);
};

export default VariationButtons;
