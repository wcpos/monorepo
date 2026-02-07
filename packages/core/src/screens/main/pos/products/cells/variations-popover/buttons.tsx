import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';
import { ToggleGroup, ToggleGroupItem } from '@wcpos/components/toggle-group';

/**
 *
 */
const VariationButtons = ({ attribute, onSelect, selected = '', optionCounts }) => {
	const options = attribute?.options || [];

	const handleSelect = (option: string) => {
		onSelect?.({ id: attribute.id, name: attribute.name, option });
	};

	return (
		<View className="flex-row">
			<ToggleGroup value={selected} onValueChange={handleSelect} type="single">
				{options.map((option) => (
					<ToggleGroupItem key={option} value={option} disabled={optionCounts[option] === 0}>
						<Text>{option}</Text>
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</View>
	);
};

export default VariationButtons;
