import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { useUISettings } from '../../../contexts/ui-settings';

interface Props {
	product: import('@wcpos/database').ProductDocument;
}

/**
 *
 */
export const MetaData = ({ product }: Props) => {
	const { uiSettings } = useUISettings('pos-products');
	const metaDataKeys = useObservableEagerState(uiSettings.metaDataKeys$);

	/**
	 * Filter the product meta data to only show the keys set in UI Settings
	 * - these keys will be passed on to the cart item
	 */
	const metaData = React.useMemo(() => {
		const keys = metaDataKeys ? metaDataKeys.split(',') : [];
		return (product.meta_data || [])
			.filter((item) => item.key && keys.includes(item.key))
			.map(({ key, value }) => ({ key, value }));
	}, [metaDataKeys, product.meta_data]);

	/**
	 * No meta data
	 */
	if (metaData.length === 0) {
		return null;
	}

	return (
		<Box space="xxSmall">
			{metaData.map((m: any) => (
				<Text size="small" key={`${m.id}`}>
					<Text size="small" type="secondary">{`${m.key}: `}</Text>
					{m.value}
				</Text>
			))}
		</Box>
	);
};
