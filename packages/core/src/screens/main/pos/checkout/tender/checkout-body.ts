import type { TenderFlow } from './use-tender-flow';

/** The one view a checkout host shows under its header, picked by `checkoutBodyFor`. */
export type CheckoutBody = 'gate' | 'cancel' | 'legacy' | 'done' | 'pane';

/**
 * A command sent and never answered gates the whole checkout (ADR 0040): each host shows this
 * before any routing, the zero-total Done, the Legacy tab and the tiles alike (Codex 4346411060,
 * 4346556708). A live terminal leg keeps its own view; the terminal service owns its commands.
 */
export const gatesCheckout = (flow: Pick<TenderFlow, 'unansweredCommand' | 'terminalLeg'>) =>
	flow.unansweredCommand && !flow.terminalLeg;

/**
 * The body ladder both hosts (the column and the routed modal) climb; each host only lays out
 * what this picks. A live terminal leg is never hidden behind another view: the pane shows it
 * (with its own Cancel) until the server says the leg is over.
 */
export function checkoutBodyFor(flow: TenderFlow): CheckoutBody {
	if (gatesCheckout(flow)) return 'gate';
	if (flow.state.view === 'cancel' && !flow.hasLiveTerminalLeg) return 'cancel';
	// A terminal leg on screen keeps the pane, live or final.
	if (flow.state.tab === 'legacy' && !flow.terminalLeg) return 'legacy';
	// Nothing left to take (a free sale, or a re-opened sale its payments cover): Done completes it.
	// An unanswered attempt keeps the pane (it is cleared first), and so does a terminal leg.
	if (flow.balanceMinor === 0 && !flow.unansweredAttempt && !flow.terminalLeg) return 'done';
	return 'pane';
}

/**
 * Money is live on a leg the cashier settles by hand. A live terminal leg is not one: it has
 * its own Cancel, and leaving lets it finish in the background.
 */
const holdsLiveManualLeg = (flow: TenderFlow) => flow.hasLiveLeg && !flow.hasLiveTerminalLeg;

/** The header's Cancel payment shows while a manual leg is live and its view is not open. */
export const offersCancelPayment = (flow: TenderFlow) =>
	holdsLiveManualLeg(flow) && flow.state.view !== 'cancel';

/**
 * Back, Escape and close on either host. Closing on a half-paid order is pressing Cancel payment:
 * a live manual leg opens the cancel view (once; again while it is open does nothing) rather than
 * drop the cashier back to the cart holding cash the order still counts as paid.
 */
export function leaveOrCancel(flow: TenderFlow, { leave }: { leave: () => void }) {
	if (!holdsLiveManualLeg(flow)) leave();
	else if (flow.state.view !== 'cancel') flow.dispatch({ type: 'request-cancel' });
}
