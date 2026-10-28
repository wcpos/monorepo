import * as React from 'react';
import { View } from 'react-native';

import { MenuRow } from '@wcpos/components/menu-row';
import { Text } from '@wcpos/components/text';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';

import { useT } from '../../contexts/translations';
import { usePanelSide } from '../../screens/main/pos/contexts/overlay-side';
import { getCommands, runCommand } from '../commands';
import { chordPlatform, DEFAULT_BINDINGS, describeChord } from './bindings';

import type { CommandContext, CommandId } from '../commands';

// The map's order reads as the till does (search, pay, carts, help); a command without a chord last.
const rank = (id: CommandId) => {
	const at = DEFAULT_BINDINGS.findIndex(({ command }) => command === id);
	return at < 0 ? DEFAULT_BINDINGS.length : at;
};

/** Every registered command with its chord (spec §4). A row runs its command, as its key does. */
export function HelpSheet({
	open,
	onOpenChange,
	ctx,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	ctx: CommandContext;
}) {
	const side = usePanelSide('shell');
	const t = useT();
	const run = (id: CommandId) => {
		onOpenChange(false);
		// After the close commits: the open sheet keeps focus inside itself, so a command that
		// focuses the search input would have it pulled back.
		setTimeout(() => void runCommand(id, ctx, { source: 'ui' }));
	};
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent side={side} size="lg" portalHost="pos" testID="hotkeys-help-sheet">
				<DialogHeader>
					<DialogTitle>{t('pos_commands.help_title')}</DialogTitle>
				</DialogHeader>
				{open && (
					<DialogBody>
						{[...getCommands()]
							.sort((a, b) => rank(a.id) - rank(b.id))
							.map((command) => {
								const keys = DEFAULT_BINDINGS.find(
									(binding) => binding.command === command.id
								)?.keys;
								return (
									<MenuRow
										key={command.id}
										testID={`hotkeys-help-row-${command.id}`}
										disabled={command.when?.(ctx) === false}
										onPress={() => run(command.id)}
										label={t(command.label)}
										trailing={
											<View className="flex-row gap-1">
												{keys &&
													describeChord(keys).map((cap) => (
														<Text
															key={cap}
															className="border-border bg-muted text-muted-foreground min-w-7 rounded-md border px-1.5 text-center"
														>
															{cap}
														</Text>
													))}
											</View>
										}
									/>
								);
							})}
					</DialogBody>
				)}
				{/* The two chords collide with Firefox's menu mnemonics on Windows only; on a Mac the
				    modifier is Option and the note would mislead. */}
				{chordPlatform() !== 'mac' && (
					<Text variant="key" className="px-4">
						{t('pos_commands.help_firefox_note')}
					</Text>
				)}
			</DialogContent>
		</Dialog>
	);
}
