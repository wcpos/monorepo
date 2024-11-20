import * as React from 'react';

import get from 'lodash/get';
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
	const rxQuery = useObservableEagerState(query.rxQuery$);
	const searchTerm = get(rxQuery, ['other', 'search', 'searchTerm']);

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 * https://shopify.github.io/flash-list/docs/fundamentals/performant-components#remove-key-prop
	 */
	return (
		<HStack className="p-2 bg-input">
			<HStack className="flex-1">
				{!!searchTerm && (
					<ButtonPill
						leftIcon="magnifyingGlass"
						size="xs"
						removable
						onRemove={() => query.search('')}
					>
						{searchTerm}
					</ButtonPill>
				)}
				{(parent.attributes || [])
					.filter((attribute) => attribute.variation)
					.sort((a, b) => (a.position || 0) - (b.position || 0))
					.map((attribute, index) => {
						return (
							<VariationSelect
								key={index}
								attribute={attribute}
								onSelect={(attribute) => {
									query.variationMatch(attribute).exec();
								}}
								selected={query.getVariationMatchOption({ id: attribute.id, name: attribute.name })}
								onRemove={() => {
									query.removeVariationMatch({ id: attribute.id, name: attribute.name }).exec();
								}}
							/>
						);
					})}
			</HStack>
			<IconButton size="sm" name="chevronUp" onPress={() => row.toggleExpanded()} />
		</HStack>
	);
};
