import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { map, tap } from 'rxjs/operators';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';

import AttributePill from './attribute-pill';
import { useVariationTable } from './context';
import { useStoreStateManager } from '../../../../../contexts/store-state-manager';
import { updateVariationAttributeSearch } from '../../../contexts/variations.helpers';

/**
 *
 */
const VariationsFilterBar = ({ parent }) => {
	const theme = useTheme();
	const manager = useStoreStateManager();
	const query = manager.getQuery(['variations', { parentID: parent.id }]);
	const { setExpanded } = useVariationTable();
	const selectedAttributes = useObservableState(
		query.state$.pipe(map((q) => get(q, ['search', 'attributes'], []))),
		get(query, ['currentState', 'search', 'attributes'], [])
	);

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(attribute) => {
			const newState = updateVariationAttributeSearch(query.currentState.search, attribute);
			query.search(newState);
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
