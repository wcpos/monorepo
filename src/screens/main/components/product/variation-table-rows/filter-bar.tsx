import * as React from 'react';

import get from 'lodash/get';
import isEqual from 'lodash/isEqual';
import { useObservableState } from 'observable-hooks';
import { map, tap, distinctUntilChanged } from 'rxjs/operators';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import { useQueryManager } from '@wcpos/query';

import AttributePill from './attribute-pill';
import { useVariationTable } from './context';

/**
 *
 */
const VariationsFilterBar = ({ parent }) => {
	const theme = useTheme();
	const manager = useQueryManager();
	const query = manager.getQuery(['variations', { parentID: parent.id }]);
	const { setExpanded } = useVariationTable();

	// new array is being created every time
	const selectedAttributes = useObservableState(
		query.params$.pipe(map((params) => get(params, ['selector', 'attributes', '$allMatch']))),
		get(query.getParams(), ['selector', 'attributes', '$allMatch'])
	);

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(attribute) => {
			query.updateVariationAttributeSelector(attribute);
		},
		[query]
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
						let selected;
						if (Array.isArray(selectedAttributes)) {
							selected = selectedAttributes.find((a) => a.name === attribute.name);
						}
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
				<Icon name="chevronUp" size="small" onPress={() => setExpanded(false)} />
			</Box>
		</Box>
	);
};

export default React.memo(VariationsFilterBar);
