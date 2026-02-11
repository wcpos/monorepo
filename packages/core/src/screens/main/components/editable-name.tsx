import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/button';
import type { InputProps } from '@wcpos/components/input';
import { Textarea } from '@wcpos/components/textarea';

/**
 * An editable name field that displays as a button and switches to a textarea on click.
 *
 * This component maintains internal editing state separate from the controlled value.
 * The parent's onChangeText is only called on submit (blur/enter), not on every keystroke.
 */
export function EditableName({
	value: valueProp,
	defaultValue,
	onChangeText,
	...props
}: InputProps) {
	const [editing, setEditing] = React.useState(false);
	// Internal editing value - separate from controlled prop
	const [editValue, setEditValue] = React.useState(valueProp ?? defaultValue ?? '');

	/**
	 * Sync internal value when prop changes externally (e.g., server update).
	 * Only sync when NOT editing to avoid overwriting user's in-progress edits.
	 * This is a legitimate useEffect for syncing with an external data source.
	 */
	React.useEffect(() => {
		if (!editing && valueProp !== undefined) {
			setEditValue(valueProp);
		}
	}, [valueProp, editing]);

	/**
	 * Submit the edited value and exit editing mode
	 */
	const handleSubmit = React.useCallback(() => {
		setEditing(false);
		onChangeText?.(editValue ?? '');
	}, [onChangeText, editValue]);

	/**
	 *
	 */
	if (editing) {
		return (
			<Textarea
				value={editValue}
				onChangeText={setEditValue}
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
				{editValue}
			</ButtonText>
		</Button>
	);
}
