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
	disabledOptions?: Record<string, boolean>;
}

/**
 *
 */
export function VariationButtons({
	attribute,
	onSelect,
	selected = '',
	optionCounts,
	disabledOptions = {},
}: VariationButtonsProps) {
	const options = attribute?.options || [];

	const handleSelect = (option: string | undefined) => {
		if (option) {
			if (disabledOptions[option]) return;
			onSelect?.({ id: attribute.id, name: attribute.name, option });
		}
	};

	return (
		<View className="flex-row">
			<ToggleGroup value={selected} onValueChange={handleSelect} type="single">
				{options.map((option: string) => (
					<ToggleGroupItem
						key={option}
						value={option}
						disabled={optionCounts[option] === 0 || disabledOptions[option]}
						testID={`variation-option-${option}`}
					>
						<Text>{option}</Text>
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</View>
	);
}
