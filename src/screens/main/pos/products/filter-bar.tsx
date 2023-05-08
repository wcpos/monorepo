import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Checkbox from '@wcpos/components/src/checkbox';
import Text from '@wcpos/components/src/text';

import { t } from '../../../../lib/translations';
import useProducts from '../../contexts/products';

const FilterBar = () => {
	const theme = useTheme();
	const { query$, setQuery } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const featured = get(query, 'selector.featured', false);
	const onSale = get(query, 'selector.on_sale', false);

	return (
		<Box space="small" horizontal>
			<Button
				title={
					<>
						<Checkbox
							value={!!featured}
							// HACK: the checkbox is not clickable when it's inside a button
							pointerEvents="none"
						/>
						<Text size="small" type={featured ? 'inverse' : undefined}>
							{t('Featured', { _tags: 'core' })}
						</Text>
					</>
				}
				size="small"
				type={featured ? 'primary' : 'inverse'}
				style={{ backgroundColor: featured ? undefined : theme.colors.lightGrey }}
				onPress={() => setQuery('selector.featured', !featured)}
			/>
			<Button
				title={
					<>
						<Checkbox
							value={!!onSale}
							// HACK: the checkbox is not clickable when it's inside a button
							pointerEvents="none"
						/>
						<Text size="small" type={onSale ? 'inverse' : undefined}>
							{t('On Sale', { _tags: 'core' })}
						</Text>
					</>
				}
				size="small"
				type={onSale ? 'primary' : 'inverse'}
				style={{ backgroundColor: onSale ? undefined : theme.colors.lightGrey }}
				onPress={() => setQuery('selector.on_sale', !onSale)}
			/>
		</Box>
	);
};

export default FilterBar;
