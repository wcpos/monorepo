import * as React from 'react';

import { ButtonPill } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import type { ProductDocument } from '@wcpos/database';

import { VariationSelect } from '../../variation-select';
import {
	getVariationMatchOption,
	removeVariationMatch,
	setVariationMatch,
} from '../../variation-matches';
import { useVariationRow } from '../context';
import { useQueryState, useQueryStateActions } from '../../../../../../query';

import type { Row } from '@tanstack/react-table';

interface Props {
	row: Row<{ document: ProductDocument }>;
}

/**
 *
 */
export function VariationsFilterBar({ row }: Props) {
	const parent = row.original.document;
	const { rowId, setRowExpanded } = useVariationRow();
	const { searchTerm, matches } = useQueryState<
		'variations',
		{ searchTerm: string; matches: import('../../../../../../query').VariationMatch[] }
	>((state) => ({ searchTerm: state.search, matches: state.filters.attributeMatches }));
	const actions = useQueryStateActions<'variations'>();

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 * https://shopify.github.io/flash-list/docs/fundamentals/performant-components#remove-key-prop
	 */
	return (
		<HStack className="bg-card-header p-2">
			<HStack className="flex-1">
				{!!searchTerm && (
					<ButtonPill leftIcon="magnifyingGlass" size="xs" removable onRemove={actions.clearSearch}>
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
								onSelect={(attribute) =>
									actions.setFilter('attributeMatches', setVariationMatch(matches, attribute))
								}
								selected={
									getVariationMatchOption(matches, {
										id: attribute.id ?? 0,
										name: attribute.name ?? '',
									}) ?? ''
								}
								onRemove={() =>
									actions.setFilter(
										'attributeMatches',
										removeVariationMatch(matches, {
											id: attribute.id ?? 0,
											name: attribute.name ?? '',
										})
									)
								}
							/>
						);
					})}
			</HStack>
			<IconButton size="sm" name="chevronUp" onPress={() => setRowExpanded?.(rowId, false)} />
		</HStack>
	);
}
