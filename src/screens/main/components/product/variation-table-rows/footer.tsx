import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
import { map } from 'rxjs/operators';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import useLocalData from '../../../../../contexts/local-data';
import { t } from '../../../../../lib/translations';
import useVariations from '../../../contexts/variations';
import useTotalCount from '../../../hooks/use-total-count';

interface VariationsFooterProps {
	count: number;
	parent: import('@wcpos/database').ProductDocument;
}

/**
 *
 */
const VariationsFooter = ({ count, parent }: VariationsFooterProps) => {
	// const { storeDB, store } = useLocalData();
	// const total = useObservableState(storeDB.products.count().$, 0);
	const theme = useTheme();
	const { replicationState } = useVariations();
	const active = useObservableState(replicationState ? replicationState.active$ : of(false), false);
	const total = useTotalCount('variations', `products/${parent.id}/variations`);

	return (
		<Box
			horizontal
			style={{
				width: '100%',
				backgroundColor: theme.colors.lightGrey,
				// borderBottomLeftRadius: theme.rounding.medium,
				// borderBottomRightRadius: theme.rounding.medium,
				borderWidth: 1,
				borderColor: theme.colors.grey,
			}}
		>
			<Box fill horizontal padding="small" space="xSmall" align="center" distribution="end">
				<Text size="small">{t('Showing {count} of {total}', { count, total, _tags: 'core' })}</Text>
			</Box>
		</Box>
	);
};

export default VariationsFooter;
