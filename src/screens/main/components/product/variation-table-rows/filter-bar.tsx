import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';

import AttributePill from './attribute-pill';
import useProducts from '../../../contexts/products';
import useVariations from '../../../contexts/variations';

/**
 *
 */
const VariationsFilterBar = ({ parent }) => {
	const theme = useTheme();
	const { setQuery } = useVariations();
	const { shownVariations$, setVariationsQuery } = useProducts();
	const allMatch = useObservableState(
		shownVariations$.pipe(
			map((q) => get(q, [parent.uuid, 'query', 'selector', 'attributes', '$allMatch'], []))
		),
		get(
			shownVariations$.getValue(),
			[parent.uuid, 'query', 'selector', 'attributes', '$allMatch'],
			[]
		)
	);

	/**
	 * Handle attribute selection
	 * Attributes queries have the form:
	 * {
	 * 	selector: {
	 * 		attributes: {
	 * 			$allMatch: [
	 * 				{
	 * 					name: 'Color',
	 * 					option: 'Blue',
	 * 				},
	 * 			],
	 * 		},
	 * 	}
	 *
	 * Note: $allMatch is an array so we need to check if it exists and add/remove to it
	 *
	 * @TODO - this sets VariationsProvider but not the parent shownVariations, so now we have two sources of truth
	 */
	const handleSelect = React.useCallback(
		(attribute) => {
			setQuery((prev) => {
				// add attribute to query
				const attributes = prev?.selector?.attributes || {};
				attributes.$allMatch = attributes.$allMatch || [];
				// add or replace attribute
				const index = attributes.$allMatch.findIndex((a) => a.name === attribute.name);
				if (index > -1) {
					attributes.$allMatch[index] = attribute;
				} else {
					attributes.$allMatch.push(attribute);
				}
				return {
					...prev,
					selector: {
						...prev.selector,
						attributes,
					},
				};
			});
		},
		[setQuery]
	);

	/**
	 *
	 */
	return (
		<Box
			horizontal
			align="center"
			padding="small"
			style={{
				backgroundColor: theme.colors.grey,
			}}
		>
			<Box fill horizontal space="small">
				{(parent.attributes || [])
					.filter((attribute) => attribute.variation)
					.sort((a, b) => (a.position || 0) - (b.position || 0))
					.map((attribute, index) => {
						// check if attribute is selected
						const selected = allMatch.find((a) => a.name === attribute.name);
						return (
							<AttributePill
								key={`${index}-${attribute.name}`}
								attribute={attribute}
								onSelect={handleSelect}
								selected={selected?.option}
							/>
						);
					})}
			</Box>
			<Box>
				<Icon name="chevronUp" size="small" onPress={() => setVariationsQuery(parent, undefined)} />
			</Box>
		</Box>
	);
};

export default VariationsFilterBar;
