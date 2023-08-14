import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { t } from '../../../lib/translations';
import SyncButton from '../components/sync-button';
import useTotalCount from '../hooks/use-total-count';

const TaxRatesFooter = ({ count, query }) => {
	const { sync, clear, replicationState } = query;
	const active = useObservableState(replicationState.active$, false);
	const total = useTotalCount(replicationState);

	return (
		<Box fill horizontal padding="small" space="xSmall" align="center" distribution="end">
			<Text size="small">{t('Showing {count} of {total}', { count, total, _tags: 'core' })}</Text>
			<SyncButton sync={sync} clear={clear} active={active} />
		</Box>
	);
};

export default TaxRatesFooter;
