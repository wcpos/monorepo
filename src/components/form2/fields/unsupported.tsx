import * as React from 'react';
import Text from '../../text';

interface UnsupportedFieldProps {
	schema: import('../types').Schema;
}

/**
 *
 */
export const UnsupportedField = ({ schema }: UnsupportedFieldProps) => {
	console.log(schema);
	// console.log(idSchema);
	// console.log(idSchema.$id);

	return <Text>{`Unknown field type ${schema?.type}`}</Text>;
};
