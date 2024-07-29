import * as React from 'react';

import { Button } from '@wcpos/tailwind/src/button';
import { Icon } from '@wcpos/tailwind/src/icon';

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
		<Button variant="ghost" className="rounded-full" onPress={() => removeLineItem(uuid, type)}>
			<Icon name="circleXmark" className="fill-destructive h-7 w-7" />
		</Button>
	);
};
