import { useFormField } from './context';

/**
 * The aria wiring every form control needs: point the control at its label, and at
 * whichever of the description / validation message is actually on screen.
 *
 * Each id is emitted only when the node it names exists. `FormLabel` renders only
 * when `label` is set, `FormDescription` only when `description` is set, and
 * `FormMessage` only when the field has an error — so the unconditional
 * `aria-describedby={`${formDescriptionNativeID} ${formMessageNativeID}`}` that eight
 * of these wrappers hand-rolled points at elements that are not in the tree for most
 * fields. `FormToggleGroup` already computed it conditionally; that is the shape the
 * others converge on here, and `toggle-group.test.tsx` is what pins it.
 *
 * The wiring lives in one place so the wrappers cannot drift apart again.
 */
export function useFormControlAria({
	label,
	description,
}: {
	label?: string;
	description?: string;
}) {
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

	return {
		/** For the `FormLabel`'s own `nativeID` — what `aria-labelledby` resolves to. */
		labelNativeID: formItemNativeID,
		ariaProps: {
			'aria-labelledby': label ? formItemNativeID : undefined,
			'aria-describedby':
				[description && formDescriptionNativeID, error && formMessageNativeID]
					.filter(Boolean)
					.join(' ') || undefined,
			'aria-invalid': !!error,
		},
	};
}
