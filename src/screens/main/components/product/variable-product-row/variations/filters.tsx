import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import type { ProductDocument, ProductVariationCollection } from '@wcpos/database';
import type { Query } from '@wcpos/query';
import type { Row } from '@wcpos/components/src/data-table';
import { HStack } from '@wcpos/components/src/hstack';
import { IconButton } from '@wcpos/components/src/icon-button';

import { VariationSelect } from '../../variation-select';

interface Props {
	row: Row<ProductDocument>;
	query: Query<ProductVariationCollection>;
}

/**
 *
 */
export const VariationsFilterBar = ({ row, query }: Props) => {
	const parent = row.original;

	/**
	 * We need to trigger a re-render when the selected attributes change.
	 * - @TODO - filter for only changes to attributes to reduce re-renders?
	 */
	const params = useObservableState(query.params$, query.getParams());
	console.log('params', params);

	/**
	 *
	 */
	return (
		<HStack className="p-2 bg-input">
			<HStack className="flex-1">
				{(parent.attributes || [])
					.filter((attribute) => attribute.variation)
					.sort((a, b) => (a.position || 0) - (b.position || 0))
					.map((attribute, index) => {
						return (
							<VariationSelect
								key={`${index}-${attribute.name}`}
								attribute={attribute}
								onSelect={(attribute) => query.where('attributes', { $elemMatch: attribute })}
								selected={query.findAttributesSelector({ id: attribute.id, name: attribute.name })}
								onRemove={() =>
									query.where('attributes', {
										$elemMatch: { id: attribute.id, name: attribute.name, option: null },
									})
								}
							/>
						);
					})}
			</HStack>
			<IconButton size="sm" name="chevronUp" onPress={() => row.toggleExpanded()} />
		</HStack>
	);
};
