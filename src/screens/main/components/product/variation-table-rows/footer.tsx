import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import { useReplicationState } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { useCollectionReset } from '../../../hooks/use-collection-reset';
import SyncButton from '../../sync-button';

/**
 *
 */
const VariationFooterTableRow = ({ query, parent, count, loading }) => {
	const theme = useTheme();
	const { sync } = useReplicationState(query);
	const { clear } = useCollectionReset(query.collection.name);
	const total = parent.variations.length;
	const t = useT();

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
				<SyncButton sync={sync} clear={clear} active={loading} />
			</Box>
		</Box>
	);
};

export default VariationFooterTableRow;
