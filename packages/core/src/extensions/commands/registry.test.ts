import { getCommands, registerCommand, resetCommandRegistry, runCommand } from './registry';
import { COMMAND_API_VERSION, COMMAND_IDS } from './types';

import type { CommandContext, CommandId } from './types';

const log = jest.fn();
function makeCtx(screen: Partial<CommandContext['screen']> = {}): CommandContext {
	return {
		log,
		screen: { route: 'cart', hasOpenOrder: true, openOrderCount: 2, lineCount: 1, ...screen },
	} as unknown as CommandContext;
}
const run = jest.fn(async () => undefined);
function register(id: CommandId, extra: Partial<Parameters<typeof registerCommand>[0]> = {}) {
	registerCommand({ id, label: `pos_commands.${id}`, run, ...extra });
}

beforeEach(() => {
	resetCommandRegistry();
	jest.clearAllMocks();
});
afterEach(() => jest.restoreAllMocks());

it('refuses an id outside COMMAND_IDS at runtime', () => {
	expect(() => register('pos.cart.explode' as CommandId)).toThrow(/not in COMMAND_IDS/);
	expect(getCommands()).toEqual([]);
});

it('sorts by id, stamps the version and freezes the snapshot and each record', () => {
	register('pos.search.focus');
	register('pos.cart.new');
	const commands = getCommands();
	expect(commands.map(({ id }) => id)).toEqual(['pos.cart.new', 'pos.search.focus']);
	expect(commands[0].commandApiVersion).toBe(COMMAND_API_VERSION);
	expect(Object.isFrozen(commands)).toBe(true);
	expect(Object.isFrozen(commands[0])).toBe(true);
	expect(getCommands()).toBe(commands);
	// The descriptor is plain data.
	const { id, label, commandApiVersion } = commands[0];
	expect(JSON.parse(JSON.stringify({ id, label, commandApiVersion }))).toEqual({
		id: 'pos.cart.new',
		label: 'pos_commands.pos.cart.new',
		commandApiVersion: 1,
	});
});

it('warns and replaces a duplicate id outside production', () => {
	const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	register('pos.cart.new');
	const replacement = jest.fn(async () => undefined);
	register('pos.cart.new', { run: replacement });
	expect(getCommands()).toHaveLength(1);
	expect(getCommands()[0].run).toBe(replacement);
	expect(warn).toHaveBeenCalledTimes(1);
});

it('throws for a duplicate id in production', () => {
	const previous = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	try {
		register('pos.cart.new');
		expect(() => register('pos.cart.new')).toThrow(/already registered/);
	} finally {
		process.env.NODE_ENV = previous;
	}
});

it('throws for an unregistered id', () => {
	expect(() => runCommand('pos.cart.new', makeCtx(), { source: 'test' })).toThrow(/not registered/);
});

it('refuses when `when` is false, with the info row and the source', async () => {
	register('pos.cart.void', { when: (ctx) => ctx.screen.hasOpenOrder });
	await expect(
		runCommand('pos.cart.void', makeCtx({ hasOpenOrder: false }), { source: 'key' })
	).resolves.toEqual({ outcome: 'refused' });
	expect(run).not.toHaveBeenCalled();
	expect(log).toHaveBeenCalledTimes(1);
	expect(log).toHaveBeenCalledWith('info', expect.any(String), {
		category: ['wcpos', 'pos', 'commands'],
		context: { type: 'command.refused', command: 'pos.cart.void', source: 'key' },
	});
});

it.each([
	['rejects', () => Promise.reject(new Error('no surface'))],
	[
		'throws',
		() => {
			throw new Error('no surface');
		},
	],
])('fails when `run` %s, with the warn row and the message', async (_, failing) => {
	register('pos.cart.void', { run: failing as () => Promise<void> });
	await expect(runCommand('pos.cart.void', makeCtx(), { source: 'ui' })).resolves.toEqual({
		outcome: 'failed',
	});
	expect(log).toHaveBeenCalledWith('warn', expect.any(String), {
		category: ['wcpos', 'pos', 'commands'],
		context: {
			type: 'command.failed',
			command: 'pos.cart.void',
			source: 'ui',
			error: 'no surface',
		},
	});
});

it('runs with the context and args, and writes a debug row', async () => {
	register('pos.cart.next', { when: () => true });
	const ctx = makeCtx();
	await expect(
		runCommand('pos.cart.next', ctx, { source: 'test', args: { from: 'x' } })
	).resolves.toEqual({ outcome: 'ran' });
	expect(run).toHaveBeenCalledWith(ctx, { from: 'x' });
	expect(log).toHaveBeenCalledWith('debug', expect.any(String), {
		category: ['wcpos', 'pos', 'commands'],
		context: { type: 'command.run', command: 'pos.cart.next', source: 'test' },
	});
});

it('registers the eight v1 commands from the barrel side effect', () => {
	jest.isolateModules(() => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		require('./commands');
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const isolated = require('./registry') as typeof import('./registry');
		expect(isolated.getCommands().map(({ id }) => id)).toEqual([...COMMAND_IDS].sort());
		expect(isolated.getCommands().every(({ label }) => label.startsWith('pos_commands.'))).toBe(
			true
		);
	});
});

it('the registered void command is refused until the void surface is mounted', () => {
	jest.isolateModules(() => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		require('./commands');
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const isolated = require('./registry') as typeof import('./registry');
		const command = isolated.getCommands().find(({ id }) => id === 'pos.cart.void')!;
		const ctx = (mounted: boolean) => ({ ...makeCtx(), hasSurface: () => mounted });
		expect(command.when?.(ctx(false))).toBe(false);
		expect(command.when?.(ctx(true))).toBe(true);
	});
});

it('refuses the cart commands while the cart is not shown; search and help are not cart commands', () => {
	jest.isolateModules(() => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		require('./commands');
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const isolated = require('./registry') as typeof import('./registry');
		const hidden = { ...makeCtx(), hasSurface: (target: string) => target !== 'cart' };
		const shown = { ...makeCtx(), hasSurface: () => true };
		for (const command of isolated.getCommands()) {
			if (command.id === 'pos.help.open') expect(command.when).toBeUndefined();
			else if (command.id === 'pos.search.focus') {
				// The products panel shows beside the register picker: the route is enough.
				expect(command.when?.(hidden)).toBe(true);
				expect(command.when?.({ ...hidden, screen: { ...hidden.screen, route: 'other' } })).toBe(
					false
				);
			} else {
				expect([command.id, command.when?.(hidden)]).toEqual([command.id, false]);
				expect([command.id, command.when?.(shown)]).toEqual([command.id, true]);
			}
		}
	});
});
