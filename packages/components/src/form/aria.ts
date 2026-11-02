import * as React from 'react';

import { FormItemContext, useFormField } from './context';

/**
 * The aria wiring every form control needs: point the control at its label, and at
 * whichever of the description / validation message is actually on screen.
 *
 * Each id is emitted only when the node it names exists. `FormLabel` renders only
 * when `label` is set, `FormDescription` only when `description` is set, and
 * `FormMessage` only when the field has an error — so the unconditional
 * `aria-describedby={`${formDescriptionNativeID} ${formMessageNativeID}`}` that eight
 * of these wrappers hand-rolled points at elements that are not in the tree for most
 * fields. `FormToggleGroup` (now `FormSegmentedControl`) already computed it
 * conditionally; that is the shape the others converge on here, and
 * `segmented-control.test.tsx` is what pins it.
 *
 * The wiring lives in one place so the wrappers cannot drift apart again.
 *
 * The hook runs in the wrapper's body, above the `FormItem` it renders, so it cannot read
 * that item's context: it mints the item id itself and the wrapper passes `itemNativeID`
 * to its `FormItem`. Reading the context here gave every control `undefined-form-item`
 * while its label carried the item's real id, so no control was named by its label.
 *
 * The context it can read is an ENCLOSING item's: a `PropertyRow` is a `FormItem` whose
 * key names the control placed in it with no `label` of its own. Such a wrapper
 * adopts that item's id, so `aria-labelledby` resolves to the row's key, and hands
 * `onLabelPress` to it, so pressing the row's key focuses or toggles the control. The
 * wrapper's own `FormDescription` / `FormMessage` then carry the row's id prefix: the row
 * must not render those itself (`PropertyRow` renders its help as a plain `Text`). The
 * nested `FormItem` only provides context, so the shared id is never a duplicate DOM id.
 */
export function useFormControlAria({
	label,
	description,
	onLabelPress,
}: {
	label?: string;
	description?: string;
	/** The wrapper's own label press (focus, toggle), for an adopted enclosing label. */
	onLabelPress?: () => void;
}) {
	const enclosing = React.useContext(FormItemContext);
	const mintedID = React.useId();
	const adopted = !label && typeof enclosing.nativeID === 'string' && enclosing.nativeID !== '';
	const itemNativeID = adopted ? enclosing.nativeID : mintedID;
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } =
		useFormField(itemNativeID);

	const setLabelPress = adopted ? enclosing.setLabelPress : undefined;
	React.useEffect(() => {
		if (!setLabelPress) {
			return;
		}
		setLabelPress(onLabelPress);
		return () => setLabelPress(undefined);
	}, [setLabelPress, onLabelPress]);

	return {
		/** For the wrapper's `FormItem`, so its label, description and message use these ids. */
		itemNativeID,
		/** For the `FormLabel`'s own `nativeID` — what `aria-labelledby` resolves to. */
		labelNativeID: formItemNativeID,
		ariaProps: {
			'aria-labelledby': label || adopted ? formItemNativeID : undefined,
			'aria-describedby':
				[description && formDescriptionNativeID, error && formMessageNativeID]
					.filter(Boolean)
					.join(' ') || undefined,
			'aria-invalid': !!error,
		},
	};
}
