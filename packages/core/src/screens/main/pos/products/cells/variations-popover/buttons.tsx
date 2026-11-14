import * as React from 'react';

import { decode } from 'html-entities';

import { Chip } from '@wcpos/components/chip';
import { HStack } from '@wcpos/components/hstack';

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

	// A variation option is a selectable choice, so it is a Chip (decision 10); an option
	// with no stock in the current combination is dimmed, never hidden. Pressing the picked
	// option again keeps it, as the toggle group it replaced did.
	const handleSelect = (option: string) => {
		if (option === selected || disabledOptions[option]) return;
		onSelect?.({ id: attribute.id, name: attribute.name, option });
	};

	return (
		<HStack className="flex-wrap gap-2">
			{options.map((option: string) => (
				<Chip
					key={option}
					label={decode(option)}
					on={option === selected}
					dimmed={optionCounts[option] === 0 || !!disabledOptions[option]}
					onPress={() => handleSelect(option)}
					testID={`variation-option-${option}`}
				/>
			))}
		</HStack>
	);
}
