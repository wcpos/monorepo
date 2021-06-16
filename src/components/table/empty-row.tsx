import * as React from 'react';
import Text from '../text';

interface EmptyRowProps {
	message?: string;
}

const EmptyRow = ({ message = 'No results found' }: EmptyRowProps) => {
	return <Text>{message}</Text>;
};

/**
 * note: statics need to be added after React.memo
 */
const MemoizedEmptyRow = React.memo(EmptyRow);
EmptyRow.displayName = 'Table.Row.Empty';

export default MemoizedEmptyRow;
