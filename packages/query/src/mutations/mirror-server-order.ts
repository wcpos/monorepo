import { patchEngineResident } from './resident';

import type { QueryRuntime } from '../provider';

export interface ServerOrderMirror {
	status?: string;
	total?: string;
	payment_method?: string;
	payment_method_title?: string;
	meta_data: unknown[];
}

/** The server already applied this payment; enqueueing would save back over its answer. */
export function mirrorServerOrder(manager: QueryRuntime, uuid: string, changes: ServerOrderMirror) {
	return patchEngineResident({
		manager,
		collection: 'orders',
		recordId: uuid,
		changes: { ...changes },
	});
}
