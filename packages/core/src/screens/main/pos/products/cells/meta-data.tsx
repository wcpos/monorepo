import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';

import { formatMetaDataValue } from '../../../components/format-meta-data-value';
import { useUISettings } from '../../../contexts/ui-settings';

interface Props {
	record: EngineRecord<'products'>;
}

/**
 *
 */
export function MetaData({ record }: Props) {
	const { uiSettings } = useUISettings('pos-products');
	const metaDataKeys = useDocField(uiSettings, (settings) => settings.metaDataKeys);
	const productMetaData = useRecordField(record, (product) => product.payload.meta_data);

	/**
	 * Filter the product meta data to only show the keys set in UI Settings
	 * - these keys will be passed on to the cart item
	 */
	const metaData = React.useMemo(() => {
		const keys = metaDataKeys ? metaDataKeys.split(',') : [];
		return (productMetaData || [])
			.filter((item) => item.key && keys.includes(item.key))
			.map(({ key, value }) => ({ key, value }));
	}, [metaDataKeys, productMetaData]);

	/**
	 * No meta data
	 */
	if (metaData.length === 0) {
		return null;
	}

	return (
		<VStack space="xs">
			{metaData.map((m: any) => (
				<Text className="text-sm" key={`${m.id}`}>
					<Text className="text-secondary-foreground">{`${m.key}: `}</Text>
					{formatMetaDataValue(m.value)}
				</Text>
			))}
		</VStack>
	);
}
