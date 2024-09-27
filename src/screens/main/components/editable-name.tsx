import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/src/button';
import type { InputProps } from '@wcpos/components/src/input';
import { Textarea } from '@wcpos/components/src/textarea';

/**
 *
 */
export const EditableName = ({
	value: valueProp,
	defaultValue,
	onChangeText,
	...props
}: InputProps) => {
	const [editing, setEditing] = React.useState(false);
	const [value, setValue] = React.useState(valueProp || defaultValue || '');

	/**
	 *
	 */
	const handleSubmit = React.useCallback(() => {
		setEditing(false);
		onChangeText && onChangeText(value);
	}, [onChangeText, value]);

	/**
	 *
	 */
	if (editing) {
		return (
			<Textarea
				value={value}
				onChangeText={setValue}
				autoFocus
				onBlur={handleSubmit}
				onSubmitEditing={handleSubmit}
				blurOnSubmit
				{...props}
			/>
		);
	}

	/**
	 *
	 */
	return (
		<Button variant="outline" className="max-w-full items-start" onPress={() => setEditing(true)}>
			<ButtonText className="font-bold" numberOfLines={1}>
				{value}
			</ButtonText>
		</Button>
	);
};
