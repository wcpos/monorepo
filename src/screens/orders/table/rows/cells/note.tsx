import * as React from 'react';
import Icon from '@wcpos/common/src/components/icon';
import Tooltip from '@wcpos/common/src/components/tooltip';

type OrderNoteProps = {
	note: string;
};

const Note = ({ note }: OrderNoteProps) => {
	if (!note) {
		return null;
	}

	return (
		<Tooltip content={note}>
			<Icon name="note" />
		</Tooltip>
	);
};

export default Note;
