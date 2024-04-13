import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Icon from '@wcpos/components/src/icon';

type OrderNoteProps = {
	item: import('@wcpos/database').OrderDocument;
};

const Note = ({ item: order }: OrderNoteProps) => {
	const note = useObservableState(order.customer_note$, order.customer_note);

	if (!note) {
		return null;
	}

	return <Icon name="messageLines" tooltip={note} />;
};

export default Note;
