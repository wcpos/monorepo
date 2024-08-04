import * as React from 'react';

import { format } from 'date-fns';

import { Text } from '../text';

export interface FormatDateProps {
	value: string;
}

const FormatDate = ({ value }: FormatDateProps) => {
	return <Text>{format(new Date(value || ''), 'dd/MM/yyyy')}</Text>;
};

export default React.memo(FormatDate);
