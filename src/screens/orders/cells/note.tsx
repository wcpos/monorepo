import * as React from 'react';
import Icon from '@wcpos/common/src/components/icon';
import Tooltip from '@wcpos/common/src/components/tooltip';

type OrderNoteProps = {
	item: import('@wcpos/common/src/database').OrderDocument;
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
