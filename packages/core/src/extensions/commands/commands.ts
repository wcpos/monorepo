import { registerCommand } from './registry';

import type { Command, CommandContext } from './types';

/** The eight v1 commands (spec §3). The hotkeys module (`../hotkeys`) binds them to keys. */
// Marks a literal key for the string extractor, which sees only `t('literal')`; the help sheet
// translates `label` at render time.
const t = (key: string) => key;
// The cart SHOWN, not just its column mounted: the column registers `cart` only while it shows the
// cart, so no key voids or switches an order behind the register picker or the count.
// The products panel shows beside the register picker and the open-register card too, so search
// needs only the route; the cart commands need the cart itself shown (`cart` surface, roadmap#428).
const onTill = (ctx: CommandContext) => ctx.screen.route === 'cart';
const inCart = (ctx: CommandContext) => onTill(ctx) && ctx.hasSurface('cart');
// `pos.cart.new` reads this as "the blank cart is not already current".
const onOrder = (ctx: CommandContext) => inCart(ctx) && ctx.screen.hasOpenOrder;
const canStep = (ctx: CommandContext) => inCart(ctx) && ctx.screen.openOrderCount > 1;
const hasLines = (ctx: CommandContext) => inCart(ctx) && ctx.screen.lineCount > 0;

const COMMANDS: [Command['id'], string, Command['when'], Command['run']][] = [
	['pos.search.focus', t('pos_commands.search_focus'), onTill, (ctx) => ctx.focus('search')],
	[
		'pos.checkout.open',
		t('pos_commands.checkout_open'),
		hasLines,
		(ctx) => ctx.navigate.openCheckout(),
	],
	['pos.cart.new', t('pos_commands.cart_new'), onOrder, (ctx) => ctx.cart.newOrder()],
	[
		'pos.cart.previous',
		t('pos_commands.cart_previous'),
		canStep,
		(ctx) => ctx.cart.selectOrder('previous'),
	],
	['pos.cart.next', t('pos_commands.cart_next'), canStep, (ctx) => ctx.cart.selectOrder('next')],
	['pos.cart.discount', t('pos_commands.cart_discount'), onOrder, (ctx) => ctx.focus('discount')],
	// The cart column registers the void surface while it is mounted, so `hasSurface('void')` is
	// true whenever the cart column is; it is false on a screen without one.
	[
		'pos.cart.void',
		t('pos_commands.cart_void'),
		(ctx) => onOrder(ctx) && ctx.hasSurface('void'),
		(ctx) => ctx.cart.void(),
	],
	// The hotkeys module registers the help sheet's opener as the `help` surface.
	['pos.help.open', t('pos_commands.help_open'), undefined, (ctx) => ctx.focus('help')],
];
for (const [id, label, when, run] of COMMANDS) registerCommand({ id, label, when, run });
