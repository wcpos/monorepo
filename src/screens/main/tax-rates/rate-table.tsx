import * as React from 'react';

import Icon from '@wcpos/components/src/icon';
import SimpleTable from '@wcpos/components/src/simple-table';
import Text from '@wcpos/components/src/text';

import { t } from '../../../lib/translations';

interface TaxRateTableProps {
	rates: import('@wcpos/database').TaxRateDocument[];
}

/**
 *
 */
const TaxRateTable = ({ rates }: TaxRateTableProps) => {
	/**
	 *
	 */
	const cellRenderer = React.useCallback(({ column, item }) => {
		let value = item[column.key];
		if (Array.isArray(item[column.key])) {
			value = item[column.key].join(', ');
		}
		if (typeof value === 'boolean') {
			return <Icon name={value ? 'check' : 'xmark'} size="small" />;
		}
		return <Text>{value || '*'}</Text>;
	}, []);

	/**
	 *
	 */
	const columns = React.useMemo(
		() => [
			{
				key: 'country',
				label: t('Country code', { _tags: 'core ' }),
				align: 'center',
				cellRenderer,
			},
			{
				key: 'state',
				label: t('State code', { _tags: 'core ' }),
				align: 'center',
				cellRenderer,
			},
			{
				key: 'postcodes',
				label: t('Postcode', { _tags: 'core ' }),
				align: 'center',
				cellRenderer,
			},
			{
				key: 'cities',
				label: t('City', { _tags: 'core ' }),
				align: 'center',
				cellRenderer,
			},
			{
				key: 'rate',
				label: t('Rate %', { _tags: 'core ' }),
				align: 'center',
			},
			{
				key: 'name',
				label: t('Tax name', { _tags: 'core ' }),
				align: 'center',
			},
			{
				key: 'priority',
				label: t('Priority', { _tags: 'core ' }),
				width: 50,
				align: 'center',
			},
			{
				key: 'compound',
				label: t('Compound', { _tags: 'core ' }),
				width: 50,
				align: 'center',
				cellRenderer,
			},
			{
				key: 'shipping',
				label: t('Shipping', { _tags: 'core ' }),
				width: 50,
				align: 'center',
				cellRenderer,
			},
		],
		[cellRenderer]
	);

	return <SimpleTable columns={columns} data={rates} />;
};

export default TaxRateTable;
