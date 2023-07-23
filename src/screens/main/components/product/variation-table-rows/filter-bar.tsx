import * as React from 'react';

import { set } from 'lodash';
import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';

import AttributePill from './attribute-pill';
import { useVariationTable } from './context';
import { useVariations, updateVariationQueryState } from '../../../contexts/variations';

/**
 *
 */
const VariationsFilterBar = ({ parent }) => {
	const theme = useTheme();
	const { setQuery } = useVariations();
	const { setVariationQuery } = useVariationTable();

	// const allMatch = useObservableState(
	// 	shownVariations$.pipe(
	// 		map((q) => get(q, [parent.uuid, 'query', 'selector', 'attributes', '$allMatch'], []))
	// 	),
	// 	get(
	// 		shownVariations$.getValue(),
	// 		[parent.uuid, 'query', 'selector', 'attributes', '$allMatch'],
	// 		[]
	// 	)
	// );

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(attribute) => setQuery((prev) => updateVariationQueryState(prev, attribute)),
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
						// const selected = allMatch.find((a) => a.name === attribute.name);
						return (
							<AttributePill
								key={`${index}-${attribute.name}`}
								attribute={attribute}
								onSelect={handleSelect}
								// selected={selected?.option}
							/>
						);
					})}
			</Box>
			<Box>
				<Icon name="chevronUp" size="small" onPress={() => setVariationQuery(null)} />
			</Box>
		</Box>
	);
};

export default VariationsFilterBar;
