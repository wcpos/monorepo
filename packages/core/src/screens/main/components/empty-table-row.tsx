import React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';

interface EmptyTableRowProps {
	message?: string;
}

const EmptyTableRow = ({ message }: EmptyTableRowProps) => {
	const t = useT();

	return (
		<View className="p-2">
			<Text>{message || t('No results found', { _tags: 'core' })}</Text>
		</View>
	);
};

export default EmptyTableRow;
