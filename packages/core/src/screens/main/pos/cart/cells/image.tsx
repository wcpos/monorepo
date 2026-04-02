import * as React from 'react';

import { Image } from '@wcpos/components/image';

import type { CellContext } from '@tanstack/react-table';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];

interface Props {
	uuid: string;
	item: LineItem;
	type: 'line_items';
}

export function LineItemImage({ row }: CellContext<Props, 'image'>) {
	const imageUrl = row.original.item.image?.src;

	if (!imageUrl) {
		return null;
	}

	return (
		<Image
			source={{ uri: imageUrl }}
			recyclingKey={row.original.uuid}
			className="h-10 w-10 rounded"
		/>
	);
}
