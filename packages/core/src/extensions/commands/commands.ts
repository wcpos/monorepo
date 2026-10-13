import { registerCommand } from './registry';

import type { Command, CommandContext } from './types';

/** The eight v1 commands (spec §3). No key is bound here: the hotkeys module binds them. */
const inCart = (ctx: CommandContext) => ctx.screen.route === 'cart';
// `pos.cart.new` reads this as "the blank cart is not already current".
const onOrder = (ctx: CommandContext) => inCart(ctx) && ctx.screen.hasOpenOrder;
const canStep = (ctx: CommandContext) => inCart(ctx) && ctx.screen.openOrderCount > 1;
const hasLines = (ctx: CommandContext) => inCart(ctx) && ctx.screen.lineCount > 0;

const COMMANDS: [Command['id'], string, Command['when'], Command['run']][] = [
	['pos.search.focus', 'pos_commands.search_focus', inCart, (ctx) => ctx.focus('search')],
	[
		'pos.checkout.open',
		'pos_commands.checkout_open',
		hasLines,
		(ctx) => ctx.navigate.openCheckout(),
	],
	['pos.cart.new', 'pos_commands.cart_new', onOrder, (ctx) => ctx.cart.newOrder()],
	[
		'pos.cart.previous',
		'pos_commands.cart_previous',
		canStep,
		(ctx) => ctx.cart.selectOrder('previous'),
	],
	['pos.cart.next', 'pos_commands.cart_next', canStep, (ctx) => ctx.cart.selectOrder('next')],
	['pos.cart.discount', 'pos_commands.cart_discount', onOrder, (ctx) => ctx.focus('discount')],
	// The cart column registers the void surface while it is mounted, so `hasSurface('void')` is
	// true whenever the cart column is; it is false on a screen without one.
	[
		'pos.cart.void',
		'pos_commands.cart_void',
		(ctx) => onOrder(ctx) && ctx.hasSurface('void'),
		(ctx) => ctx.cart.void(),
	],
	// The help sheet arrives with the hotkeys module (PR 2 of roadmap#428), which opens it.
	['pos.help.open', 'pos_commands.help_open', undefined, async () => undefined],
];
for (const [id, label, when, run] of COMMANDS) registerCommand({ id, label, when, run });
