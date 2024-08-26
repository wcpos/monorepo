import * as React from 'react';

import get from 'lodash/get';
import { useObservableEagerState, useObservableState } from 'observable-hooks';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { HStack } from '@wcpos/components/src/hstack';
import { IconButton } from '@wcpos/components/src/icon-button';

import { VariationAttributePill } from './attribute-pill';
import { useVariationTable } from './context';
import { VariationSearchPill } from './search-pill';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductCollection = import('@wcpos/database').ProductCollection;
type Query = import('@wcpos/query').Query<ProductCollection>;

interface Props {
	parent: ProductDocument;
	query: Query;
	parentSearchTerm?: string;
}

/**
 *
 */
export const VariationsFilterBar = ({ parent, query, parentSearchTerm }: Props) => {
	const { setExpanded } = useVariationTable();

	// new array is being created every time
	const selectedAttributes = useObservableEagerState(
		query.params$.pipe(
			map(() => query.findSelector('attributes')),
			distinctUntilChanged((prev, next) => {
				const test = JSON.stringify(prev) === JSON.stringify(next);
				debugger;
				return test;
			})
		)
	);
	console.log('selectedAttributes', selectedAttributes);

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(attribute) => {
			query.where('attributes', { $elemMatch: { name: attribute.name, option: attribute.option } });
		},
		[query]
	);

	/**
	 *
	 */
	const handleSearch = React.useCallback(
		(search: string) => {
			query.debouncedSearch(search);
		},
		[query]
	);

	/**
	 *
	 */
	React.useEffect(() => {
		if (parentSearchTerm) {
			query.search(parentSearchTerm);
		}
	}, [parentSearchTerm, query]);

	/**
	 *
	 */
	return (
		<HStack className="bg-gray-100">
			<HStack className="flex-wrap">
				<VariationSearchPill onSearch={handleSearch} parentSearchTerm={parentSearchTerm} />
				{(parent.attributes || [])
					.filter((attribute) => attribute.variation)
					.sort((a, b) => (a.position || 0) - (b.position || 0))
					.map((attribute, index) => {
						let selected;
						if (Array.isArray(selectedAttributes)) {
							selected = selectedAttributes.find((a) => a.name === attribute.name);
						}
						return (
							<VariationAttributePill
								key={`${index}-${attribute.name}`}
								attribute={attribute}
								onSelect={handleSelect}
								selected={selected?.option}
							/>
						);
					})}
			</HStack>
			<IconButton name="chevronUp" onPress={() => setExpanded(false)} />
		</HStack>
	);
};
