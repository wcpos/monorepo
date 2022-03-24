import * as React from 'react';
import Text from '../../text';
/**
 *
 */
export function UnsupportedField<T extends object>({
	schema,
	idSchema,
	reason,
}: import('../types').FieldProps<T>) {
	const text = 'Unsupported field schema';
	console.log(schema);
	console.log(idSchema);
	console.log(idSchema.$id);
	console.log(reason);

	return <Text>{text}</Text>;
}
