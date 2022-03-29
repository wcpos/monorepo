import * as React from 'react';
import Text from '../../text';

interface UnsupportedFieldProps {
	schema: import('../types').Schema;
	reason: string;
}

/**
 *
 */
export const UnsupportedField = ({ schema, reason }: UnsupportedFieldProps) => {
	console.log(schema);
	// console.log(idSchema);
	// console.log(idSchema.$id);

	return <Text>{`${reason} ${schema?.type}`}</Text>;
};
