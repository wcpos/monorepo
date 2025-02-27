import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/button';
import type { InputProps } from '@wcpos/components/input';
import { Textarea } from '@wcpos/components/textarea';

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
	 * Update value if prop changes
	 */
	React.useEffect(() => {
		setValue(valueProp);
	}, [valueProp]);

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
	 * Sometimes the product name from WooCommerce is encoded in html entities
	 */
	return (
		<Button variant="outline" className="max-w-full items-start" onPress={() => setEditing(true)}>
			<ButtonText className="font-bold" numberOfLines={1} decodeHtml>
				{value}
			</ButtonText>
		</Button>
	);
};
