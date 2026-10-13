import type { ActionContext } from '../actions';

export const COMMAND_API_VERSION = 1;
/** Closed list for v1; it grows by edit. */
export const COMMAND_IDS = [
	'pos.search.focus',
	'pos.checkout.open',
	'pos.cart.new',
	'pos.cart.previous',
	'pos.cart.next',
	'pos.cart.discount',
	'pos.cart.void',
	'pos.help.open',
] as const;
export type CommandId = (typeof COMMAND_IDS)[number];
/** Who raised the command; a palette, a hardware button or a macro join later. */
export type CommandSource = 'key' | 'ui' | 'test';
/** Plain serialisable data: what a manifest could one day name (#226). */
export interface CommandDescriptor {
	id: CommandId;
	/** A translation key under `pos_commands.`; the help sheet and a palette render `t(label)`. */
	label: string;
	commandApiVersion: typeof COMMAND_API_VERSION;
}
export interface Command extends CommandDescriptor {
	/** Pure and cheap: reads `ctx.screen` and `ctx.hasSurface` only, never React state, never awaits. */
	when?: (ctx: CommandContext) => boolean;
	run: (ctx: CommandContext, args?: Readonly<Record<string, unknown>>) => Promise<void>;
}
/** What a mounted surface registers: the Pay button, the void button, the search input, the discount opener. */
export type SurfaceTarget = 'pay' | 'void' | 'search' | 'discount';
export type RunOutcome = { outcome: 'ran' | 'refused' | 'failed' };

/**
 * The action context plus three host capabilities. Every verb is a promise that may reject;
 * nothing here is a React object (no router, no order record, no ref): a verb that needs one
 * closes over it in the provider or in the registering surface.
 */
export interface CommandContext extends ActionContext {
	/** `openCheckout` and `cart.void` run the button's own path and reject when it is not mounted. */
	readonly navigate: { openCheckout(): Promise<void> };
	readonly cart: {
		newOrder(): Promise<void>;
		/** An open order by uuid, or a step through the open carts (wrapping, receipts skipped). */
		selectOrder(target: string | 'previous' | 'next'): Promise<void>;
		void(): Promise<void>;
	};
	focus(target: 'search' | 'discount'): Promise<void>;
	/** Whether a surface is mounted right now, for `when`: a verb over an unmounted one would fail. */
	hasSurface(target: SurfaceTarget): boolean;
	/** What `when` reads: `hasOpenOrder` is "not the blank cart", `openOrderCount` skips receipts. */
	readonly screen: {
		readonly route: 'cart' | 'checkout' | 'other';
		readonly hasOpenOrder: boolean;
		readonly openOrderCount: number;
		/** Product, fee and shipping lines on the current cart. */
		readonly lineCount: number;
	};
}
