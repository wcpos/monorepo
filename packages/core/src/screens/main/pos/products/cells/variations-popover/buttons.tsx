import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';
import { ToggleGroup, ToggleGroupItem } from '@wcpos/components/toggle-group';

interface VariationButtonsProps {
	attribute: {
		id?: number;
		name?: string;
		options?: string[];
	};
	onSelect: (attr: { id?: number; name?: string; option: string }) => void;
	selected?: string;
	optionCounts: Record<string, number>;
}

/**
 *
 */
const VariationButtons = ({
	attribute,
	onSelect,
	selected = '',
	optionCounts,
}: VariationButtonsProps) => {
	const options = attribute?.options || [];

	const handleSelect = (option: string | undefined) => {
		if (option) {
			onSelect?.({ id: attribute.id, name: attribute.name, option });
		}
	};

	return (
		<View className="flex-row">
			<ToggleGroup value={selected} onValueChange={handleSelect} type="single">
				{options.map((option: string) => (
					<ToggleGroupItem key={option} value={option} disabled={optionCounts[option] === 0}>
						<Text>{option}</Text>
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</View>
	);
};

export default VariationButtons;
