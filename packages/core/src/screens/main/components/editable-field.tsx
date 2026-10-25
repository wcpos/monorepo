import * as React from 'react';

import { Button } from '@wcpos/components/button';
import type { InputProps } from '@wcpos/components/input';
import { cn } from '@wcpos/components/lib/utils';
import { PROPERTY_PLACEHOLDER_CLASS } from '@wcpos/components/property-row';
import { Text } from '@wcpos/components/text';
import { Textarea } from '@wcpos/components/textarea';

/**
 * An editable name field that displays as a button and switches to a textarea on click.
 *
 * This component maintains internal editing state separate from the controlled value.
 * The parent's onChangeText is only called on submit (blur/enter), not on every keystroke.
 * At rest an empty value shows its `placeholder` in the property rows' placeholder ink.
 */
export function EditableField({
	value: valueProp,
	defaultValue,
	onChangeText,
	editable = true,
	bold = true,
	variant = 'outline',
	numberOfLines = 1,
	startEditing = false,
	...props
}: InputProps & {
	bold?: boolean;
	variant?: 'outline' | 'ghost';
	numberOfLines?: number;
	/** Mount in edit mode, focused: a field the owner has just added. */
	startEditing?: boolean;
}) {
	const [editing, setEditing] = React.useState(startEditing);
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
	const empty = !editValue && !!props.placeholder;
	return (
		<Button
			variant={variant}
			className={
				variant === 'ghost'
					? '-mx-1 h-auto min-h-9 max-w-full items-start justify-start px-1 py-1.5'
					: 'max-w-full items-start'
			}
			onPress={() => setEditing(true)}
			disabled={!editable}
		>
			{/* The field's value is data, not a quiet action: on a ghost it keeps the foreground
			    over the variant's muted label (a cart line's name must not read as disabled). */}
			<Text
				className={cn(
					variant === 'ghost' && 'text-foreground font-normal',
					bold && 'font-bold',
					empty && PROPERTY_PLACEHOLDER_CLASS
				)}
				numberOfLines={numberOfLines}
				decodeHtml
			>
				{empty ? props.placeholder : editValue}
			</Text>
		</Button>
	);
}
