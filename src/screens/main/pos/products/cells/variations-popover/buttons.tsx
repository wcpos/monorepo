import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/src/text';
import { ToggleGroup, ToggleGroupItem } from '@wcpos/components/src/toggle-group';

/**
 *
 */
const VariationButtons = ({ attribute, onSelect, selected = '' }) => {
	const [value, setValue] = React.useState<string>(selected);
	const options = attribute?.options || [];

	/**
	 *
	 */
	const handleSelect = (option: string) => {
		setValue(option);
		onSelect?.({ id: attribute.id, name: attribute.name, option });
	};

	return (
		<View className="flex-row">
			<ToggleGroup value={value} onValueChange={handleSelect} type="single">
				{options.map((option) => (
					<ToggleGroupItem key={option} value={option}>
						<Text>{option}</Text>
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</View>
	);
};

export default VariationButtons;
