import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { t } from '../../../../../lib/translations';
import { useVariations } from '../../../contexts/variations';
import SyncButton from '../../sync-button';

const VariationFooterTableRow = ({ count, total, loading }) => {
	const theme = useTheme();
	const { sync, clear } = useVariations();

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
