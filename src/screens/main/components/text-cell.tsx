import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

type Props = {
	item: import('rxdb').RxDocument;
	column: import('../contexts/ui-settings').UISettingsColumn;
};

const TextCell = ({ item, column }: Props) => {
	const text = useObservableState(item[column.key + '$'], item[column.key]);
	return <Text>{text}</Text>;
};

export default TextCell;
