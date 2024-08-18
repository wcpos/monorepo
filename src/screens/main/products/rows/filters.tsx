import * as React from 'react';

import { HStack } from '@wcpos/tailwind/src/hstack';
import { IconButton } from '@wcpos/tailwind/src/icon-button';

import { VariationSelect } from './variation-select';

/**
 *
 */
export const VariationsFilterBar = ({ row }) => {
	const parent = row.original;
	const selectedAttributes = [];

	return (
		<HStack className="p-2 bg-input">
			<HStack className="flex-1">
				{(parent.attributes || [])
					.filter((attribute) => attribute.variation)
					.sort((a, b) => (a.position || 0) - (b.position || 0))
					.map((attribute, index) => {
						let selected;
						if (Array.isArray(selectedAttributes)) {
							selected = selectedAttributes.find((a) => a.name === attribute.name);
						}
						return (
							<VariationSelect
								key={`${index}-${attribute.name}`}
								attribute={attribute}
								// onSelect={handleSelect}
								selected={selected?.option}
							/>
						);
					})}
			</HStack>
			<IconButton size="sm" name="chevronUp" onPress={() => row.toggleExpanded()} />
		</HStack>
	);
};
