import * as React from 'react';
import Icon from '@wcpos/components/src/icon';
import Tooltip from '@wcpos/components/src/tooltip';

type OrderNoteProps = {
	item: import('@wcpos/database').OrderDocument;
};

const Note = ({ item: order }: OrderNoteProps) => {
	if (!order.note) {
		return null;
	}

	return (
		<Tooltip content={order.note}>
			<Icon name="note" />
		</Tooltip>
	);
};

export default Note;
