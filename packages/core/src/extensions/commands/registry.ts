import { getErrorMessage } from '@wcpos/utils/logger';

import { COMMAND_API_VERSION, COMMAND_IDS } from './types';

import type {
	Command,
	CommandContext,
	CommandId,
	CommandRegistration,
	CommandSource,
	RunOutcome,
} from './types';

const COMMANDS_CATEGORY = ['wcpos', 'pos', 'commands'];
/**
 * Module-level and static, as the slot and action registries: commands register at import
 * time, so the registry is inspectable from a test without React.
 */
const commands = new Map<CommandId, Command>();
let snapshot: readonly Command[] | null = null;

export function registerCommand({
	commandApiVersion = COMMAND_API_VERSION,
	...command
}: CommandRegistration): void {
	// The union is closed at compile time; this catches a cast or a manifest at runtime.
	if (!(COMMAND_IDS as readonly string[]).includes(command.id))
		throw new Error(`Command "${command.id}" is not in COMMAND_IDS`);
	if (commands.has(command.id)) {
		if (process.env.NODE_ENV === 'production')
			throw new Error(`Command "${command.id}" already registered`);
		// Replace rather than throw: a Fast Refresh re-evaluates the registering module, and
		// so does every test that imports it. Throwing would make both of those fatal.
		console.warn(`Command "${command.id}" re-registered — replacing.`);
	}
	commands.set(command.id, Object.freeze({ ...command, commandApiVersion }));
	snapshot = null;
}

/** Every registered command, sorted by id; stable until a registration changes. */
export function getCommands(): readonly Command[] {
	snapshot ??= Object.freeze([...commands.values()].sort((a, b) => a.id.localeCompare(b.id)));
	return snapshot;
}

/**
 * Raise a command. An unknown id throws (a programming error, never reached from a key); a
 * `when` that answers false resolves `refused`; a `run` that throws or rejects resolves
 * `failed`. Each outcome writes one row; only the refusal and the failure are the merchant's.
 */
export function runCommand(
	id: CommandId,
	ctx: CommandContext,
	{ source, args }: { source: CommandSource; args?: Readonly<Record<string, unknown>> }
): Promise<RunOutcome> {
	const command = commands.get(id);
	if (!command) throw new Error(`Command "${id}" is not registered`);
	const row = (level: 'debug' | 'info' | 'warn', message: string, context: object) =>
		ctx.log(level, message, {
			category: COMMANDS_CATEGORY,
			context: { ...context, command: id, source },
		});
	if (command.when && !command.when(ctx)) {
		row('info', 'A shortcut was not available', { type: 'command.refused' });
		return Promise.resolve({ outcome: 'refused' });
	}
	return (async (): Promise<RunOutcome> => {
		try {
			await command.run(ctx, args);
		} catch (error) {
			row('warn', 'A shortcut did not finish', {
				type: 'command.failed',
				error: getErrorMessage(error),
			});
			return { outcome: 'failed' };
		}
		row('debug', 'Command ran', { type: 'command.run' });
		return { outcome: 'ran' };
	})();
}

/** Test-only escape hatch: drop every registration. */
export function resetCommandRegistry(): void {
	commands.clear();
	snapshot = null;
}
