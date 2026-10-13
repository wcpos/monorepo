import * as React from 'react';

import { useIsFocused } from 'expo-router/react-navigation';

import { useHotkeys } from '@wcpos/hooks/use-hotkeys';

import { runCommand, useCommandContext, useRegisterSurface } from '../commands';
import { DEFAULT_BINDINGS } from './bindings';
import { HelpSheet } from './help-sheet';

import type { CommandContext, CommandId } from '../commands';

const EDITABLE = 'input, textarea, select, [contenteditable]';
// Active inside inputs too (R4). `preventDefault` stops the browser's own Alt+letter; nothing
// stops propagation, so the barcode wedge detector on the document sees every keystroke. A key
// another handler already answered (the cart strip's own arrows) is left alone, and so is a dead
// key inside a field: on a Mac, Option+N is how ñ and ń are typed.
const OPTIONS = {
	enableOnFormTags: true,
	enableOnContentEditable: true,
	preventDefault: true,
	ignoreEventWhen: (event: KeyboardEvent) =>
		event.defaultPrevented ||
		(event.key === 'Dead' && (event.target as Element | null)?.closest?.(EDITABLE) != null),
};
// A chord whose previous run has not settled is dropped (spec §3).
const inFlight = new Set<CommandId>();

/** Web and Electron: binds the default chords while the POS is mounted and hosts the help sheet. */
export function Hotkeys() {
	const ctx = useCommandContext();
	// Drawer screens stay mounted behind one another (`display: none`): the chords are live only
	// while the POS screen is the focused one, and the sheet closes when it stops being.
	const focused = useIsFocused();
	// A key lands between renders; it raises the command against the latest context.
	const latest = React.useRef(ctx);
	React.useLayoutEffect(() => {
		latest.current = ctx;
	});
	const [helpOpen, setHelpOpen] = React.useState(false);
	const helpOpenRef = React.useRef(helpOpen);
	React.useLayoutEffect(() => {
		helpOpenRef.current = helpOpen;
	}, [helpOpen]);
	useRegisterSurface('help', () => setHelpOpen(true));
	// Adjusted during render (React's "state from props" idiom), so there is no effect cascade.
	const [wasFocused, setWasFocused] = React.useState(focused);
	if (focused !== wasFocused) {
		setWasFocused(focused);
		if (!focused) setHelpOpen(false);
	}
	// A chord pressed over the open sheet: `Alt+/` closes it; any other closes it first and runs
	// after the close commits, as a row press does (the open sheet's focus trap would pull a focus
	// back). Returns true when the sheet handled the press.
	const closeHelpFor = React.useCallback((command: CommandId, run: () => void) => {
		if (!helpOpenRef.current) return false;
		setHelpOpen(false);
		if (command !== 'pos.help.open') setTimeout(run);
		return true;
	}, []);
	return (
		<>
			{DEFAULT_BINDINGS.map(({ keys, command }) => (
				<Binding
					key={keys}
					keys={keys}
					command={command}
					ctx={latest}
					enabled={focused}
					closeHelpFor={closeHelpFor}
				/>
			))}
			<HelpSheet open={helpOpen} onOpenChange={setHelpOpen} ctx={ctx} />
		</>
	);
}

/** One registration per binding. */
function Binding({
	keys,
	command,
	ctx,
	enabled,
	closeHelpFor,
}: {
	keys: string;
	command: CommandId;
	ctx: { readonly current: CommandContext };
	enabled: boolean;
	closeHelpFor: (command: CommandId, run: () => void) => boolean;
}) {
	useHotkeys(
		keys,
		() => {
			if (inFlight.has(command)) return;
			const run = () => {
				if (inFlight.has(command)) return; // a second press may land before a deferred run
				inFlight.add(command);
				void runCommand(command, ctx.current, { source: 'key' }).finally(() =>
					inFlight.delete(command)
				);
			};
			if (!closeHelpFor(command, run)) run();
		},
		{ ...OPTIONS, enabled }
	);
	return null;
}
