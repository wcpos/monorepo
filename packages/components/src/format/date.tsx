import * as React from 'react';

import { format } from 'date-fns';

import { Text } from '../text';

export interface FormatDateProps {
	value: string;
}

function FormatDate({ value }: FormatDateProps) {
	return <Text>{format(new Date(value || ''), 'dd/MM/yyyy')}</Text>;
}

const MemoizedFormatDate = React.memo(FormatDate);
export { MemoizedFormatDate as FormatDate };
