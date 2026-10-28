import * as React from 'react';

import { PosterThumb } from '@wcpos/components/poster-tile';
import type { CellContext } from '@wcpos/core/table-types';

type LineItem = import('@wcpos/query').OrderLineItem;

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
		<PosterThumb
			picture={{ kind: 'image', source: { uri: imageUrl }, recyclingKey: row.original.uuid }}
			size="sm"
		/>
	);
}
