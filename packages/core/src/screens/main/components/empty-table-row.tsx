import React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';

interface EmptyTableRowProps {
	message?: string;
}

export function EmptyTableRow({ message }: EmptyTableRowProps) {
	const t = useT();

	return (
		<View className="p-2">
			<Text>{message || t('common.no_results_found')}</Text>
		</View>
	);
}
