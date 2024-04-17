import * as React from 'react';

import Icon from '@wcpos/components/src/icon';

import { useRemoveLineItem } from '../../hooks/use-remove-line-item';

interface ActionProps {
	uuid: string;
	type: 'line_items' | 'fee_lines' | 'shipping_lines';
	item:
		| import('@wcpos/database').OrderDocument['line_items']
		| import('@wcpos/database').OrderDocument['fee_lines']
		| import('@wcpos/database').OrderDocument['shipping_lines'];
}

export const Actions = ({ uuid, type, item }: ActionProps) => {
	const { removeLineItem } = useRemoveLineItem();

	/**
	 *
	 */
	return (
		<Icon
			name="circleXmark"
			size="xLarge"
			onPress={() => removeLineItem(uuid, type)}
			type="critical"
		/>
	);
};
