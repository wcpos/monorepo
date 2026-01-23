import * as React from 'react';

import { useControllableState } from '@rn-primitives/hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import type { InputProps } from '@wcpos/components/input';
import { Textarea } from '@wcpos/components/textarea';

/**
 * An editable name field that displays as a button and switches to a textarea on click.
 * Uses useControllableState to support both controlled and uncontrolled usage patterns.
 */
export const EditableName = ({
	value: valueProp,
	defaultValue,
	onChangeText,
	...props
}: InputProps) => {
	const [editing, setEditing] = React.useState(false);
	const [value, setValue] = useControllableState<string>({
		prop: valueProp,
		defaultProp: defaultValue ?? '',
	});

	/**
	 * Submit the edited value and exit editing mode
	 */
	const handleSubmit = React.useCallback(() => {
		setEditing(false);
		onChangeText?.(value ?? '');
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
