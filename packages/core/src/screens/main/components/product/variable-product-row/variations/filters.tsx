import * as React from 'react';

import { Chip } from '@wcpos/components/chip';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { VariationSelect } from '../../variation-select';
import {
	getVariationMatchOption,
	removeVariationMatch,
	setVariationMatch,
} from '../../variation-matches';
import { useVariationRow } from '../context';
import { useT } from '../../../../../../contexts/translations';
import { useQueryState, useQueryStateActions } from '../../../../../../query';

import type { DataTableFeatures } from '../../../data-table';
import type { Row } from '../../../../../../table-types';

interface Props {
	row: Row<{ record: EngineRecord<'products'> }, DataTableFeatures>;
}

/**
 *
 */
export function VariationsFilterBar({ row }: Props) {
	const attributes = useRecordField(row.original.record, (parent) => parent.payload.attributes);
	const { rowId, setRowExpanded } = useVariationRow();
	const { searchTerm, matches } = useQueryState<
		'variations',
		{ searchTerm: string; matches: import('../../../../../../query').VariationMatch[] }
	>((state) => ({ searchTerm: state.search, matches: state.filters.attributeMatches }));
	const actions = useQueryStateActions<'variations'>();
	const t = useT();

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 * https://shopify.github.io/flash-list/docs/fundamentals/performant-components#remove-key-prop
	 */
	return (
		// The strip is a row of 44 (`min-h-row`) so its sm chips' grown targets fit inside it: a
		// touch area never reaches past its parent. At Regular the bar keeps its 48 pt height.
		<HStack className="bg-card-header px-2 py-0.5">
			<HStack className="min-h-row flex-1 items-center">
				{!!searchTerm && (
					<Chip
						size="sm"
						icon="search"
						label={searchTerm}
						onClear={actions.clearSearch}
						clearLabel={t('common.remove')}
					/>
				)}
				{(attributes || [])
					.filter((attribute) => attribute.variation)
					.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
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
			<IconButton
				size="sm"
				name="chevronUp"
				accessibilityLabel={t('common.collapse')}
				onPress={() => setRowExpanded?.(rowId, false)}
			/>
		</HStack>
	);
}
