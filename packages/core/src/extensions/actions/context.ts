import type { ActionContext } from './types';

export function createActionContext({
	log,
	t,
	// A closure, not `Date.now` itself: a reference captured here would outlive a test's fake
	// clock and the budgets would run on real time.
	now = () => Date.now(),
	readCatalog,
	preventOverselling,
	resolveSession,
}: {
	log: ActionContext['log'];
	t: ActionContext['t'];
	now?: () => number;
	readCatalog: ActionContext['read']['catalog'];
	preventOverselling: boolean;
	resolveSession: ActionContext['register']['resolveSession'];
}): ActionContext {
	// Frozen so a hook cannot swap a noun out from under the hooks after it.
	return Object.freeze({
		log,
		t,
		now,
		read: Object.freeze({ catalog: readCatalog }),
		store: Object.freeze({ preventOverselling }),
		register: Object.freeze({ resolveSession }),
	});
}
