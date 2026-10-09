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
	return { log, t, now, read: { catalog: readCatalog }, store: { preventOverselling } };
}
