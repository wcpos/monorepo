import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill } from '@wcpos/components/src/button';
import { HStack } from '@wcpos/components/src/hstack';
import { IconButton } from '@wcpos/components/src/icon-button';
import type { ProductDocument, ProductVariationCollection } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { VariationSelect } from '../../variation-select';

import type { Row } from '@tanstack/react-table';

interface Props {
	row: Row<{ document: ProductDocument }>;
	query: Query<ProductVariationCollection>;
}

/**
 *
 */
export const VariationsFilterBar = ({ row, query }: Props) => {
	const parent = row.original.document;

	/**
	 * We need to trigger a re-render when the selected attributes change.
	 */
	const params = useObservableEagerState(query.params$);

	/**
	 *
	 */
	return (
		<HStack className="p-2 bg-input">
			<HStack className="flex-1">
				{!!params?.search && (
					<ButtonPill
						leftIcon="magnifyingGlass"
						size="xs"
						removable
						onRemove={() => query.search('')}
					>
						{params.search}
					</ButtonPill>
				)}
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
