import * as React from 'react';

import { useHotkeys } from '@wcpos/hooks/use-hotkeys';

import { runCommand, useCommandContext, useRegisterSurface } from '../commands';
import { DEFAULT_BINDINGS } from './bindings';
import { HelpSheet } from './help-sheet';

import type { CommandContext, CommandId } from '../commands';

// Active inside inputs too (R4). `preventDefault` stops the browser's own Alt+letter; nothing
// stops propagation, so the barcode wedge detector on the document sees every keystroke.
const OPTIONS = { enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true };
// A chord whose previous run has not settled is dropped (spec §3).
const inFlight = new Set<CommandId>();

/** Web and Electron: binds the default chords while the POS is mounted and hosts the help sheet. */
export function Hotkeys() {
	const ctx = useCommandContext();
	// A key lands between renders; it raises the command against the latest context.
	const latest = React.useRef(ctx);
	React.useLayoutEffect(() => {
		latest.current = ctx;
	});
	const [helpOpen, setHelpOpen] = React.useState(false);
	useRegisterSurface('help', () => setHelpOpen(true));
	return (
		<>
			{DEFAULT_BINDINGS.map(({ keys, command }) => (
				<Binding key={keys} keys={keys} command={command} ctx={latest} />
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
}: {
	keys: string;
	command: CommandId;
	ctx: { readonly current: CommandContext };
}) {
	useHotkeys(
		keys,
		() => {
			if (inFlight.has(command)) return;
			inFlight.add(command);
			void runCommand(command, ctx.current, { source: 'key' }).finally(() =>
				inFlight.delete(command)
			);
		},
		OPTIONS
	);
	return null;
}
