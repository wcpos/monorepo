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
export function EditableField({
	value: valueProp,
	defaultValue,
	onChangeText,
	editable = true,
	bold = true,
	...props
}: InputProps & { bold?: boolean }) {
	const [editing, setEditing] = React.useState(false);
	// Internal editing value - separate from controlled prop
	const [editValue, setEditValue] = React.useState(valueProp ?? defaultValue ?? '');

	/**
	 * Sync internal value when the prop changes externally (e.g., server update).
	 * Only sync when NOT editing to avoid overwriting the user's in-progress edits.
	 * Implemented as the React "adjust state during render" pattern (tracking the
	 * previous prop value) rather than an effect, so it never sets state inside
	 * useEffect.
	 */
	const syncedValue = valueProp ?? defaultValue ?? '';
	const [prevSyncedValue, setPrevSyncedValue] = React.useState(syncedValue);
	const [pendingSyncedValue, setPendingSyncedValue] = React.useState<string | null>(null);
	const [editDirty, setEditDirty] = React.useState(false);
	const [prevEditing, setPrevEditing] = React.useState(editing);
	const syncedValueChanged = syncedValue !== prevSyncedValue;
	if (syncedValueChanged) {
		setPrevSyncedValue(syncedValue);
		if (editing) {
			setPendingSyncedValue(syncedValue);
		} else {
			setPendingSyncedValue(null);
			setEditValue(syncedValue);
		}
	}
	if (editing !== prevEditing) {
		setPrevEditing(editing);
		if (editing) {
			setEditDirty(false);
		} else {
			if (pendingSyncedValue !== null) {
				setPendingSyncedValue(null);
				if (!editDirty && !syncedValueChanged) {
					setEditValue(pendingSyncedValue);
				}
			}
			setEditDirty(false);
		}
	}

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
				onChangeText={(text) => {
					setEditDirty(true);
					setEditValue(text);
				}}
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
		<Button
			variant="outline"
			className="max-w-full items-start"
			onPress={() => setEditing(true)}
			disabled={!editable}
		>
			<ButtonText className={bold ? 'font-bold' : undefined} numberOfLines={1} decodeHtml>
				{editValue}
			</ButtonText>
		</Button>
	);
}
