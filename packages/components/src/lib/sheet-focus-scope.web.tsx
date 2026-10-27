import * as React from 'react';

import { FocusScope } from '@radix-ui/react-focus-scope';

const keep = (event: Event) => event.preventDefault();

/**
 * Web: a phone sheet renders no primitive Content, so it mounts no Radix focus scope, and a
 * modal dialog under it (a cart form's keypad) kept trapping focus: every focus in the sheet
 * went straight back to the dialog, so the keypad never heard a physical key (Codex, #2995).
 * An untrapped scope pauses the dialog's trap while the sheet is open, as a nested Radix
 * popover's Content does; it moves no focus itself, which stays the shell's.
 */
export function SheetFocusScope({ children }: { children: React.ReactElement }) {
	return (
		<FocusScope asChild onMountAutoFocus={keep} onUnmountAutoFocus={keep}>
			{children}
		</FocusScope>
	);
}
