import type { ActionContext } from './types';

export function createActionContext({
	log,
	t,
	now = Date.now,
	readCatalog,
	preventOverselling,
}: {
	log: ActionContext['log'];
	t: ActionContext['t'];
	now?: () => number;
	readCatalog: ActionContext['read']['catalog'];
	preventOverselling: boolean;
}): ActionContext {
	// Frozen so a hook cannot swap a noun out from under the hooks after it.
	return Object.freeze({
		log,
		t,
		now,
		read: Object.freeze({ catalog: readCatalog }),
		store: Object.freeze({ preventOverselling }),
	});
}
