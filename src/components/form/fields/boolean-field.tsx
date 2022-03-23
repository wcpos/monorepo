import * as React from 'react';
import Text from '../../text';

/**
 *
 */
export function BooleanField<T extends object>({
	schema,
	uiSchema,
	idSchema,
	idPrefix,
	formContext,
	formData,
	registry,
	name,
	onChange,
}: import('../types').FieldProps<T>): React.ReactElement {
	return <Text>{name}</Text>;
}
