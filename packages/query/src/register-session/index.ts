export {
	adoptCounters,
	bindRegister,
	readCarriedFrom,
	boundRegisterIdOf,
	getBoundRegister,
	getCurrentBoundRegisterId,
	mintUuid,
	nextSaleCounter,
	observeRegister$,
	readBoundRegister,
	readCounters,
	readLiveSession,
	readRegister,
	recordLiveSession,
	unbindRegister,
} from './register-document';
export type { RegisterCounters, RegisterDocument } from './register-document';
export type { ClosureRow, RegisterSessionRow } from '@wcpos/database';

export { recordRegisterFact, type RegisterFact } from './audit';
export { failureFacts } from './failure-facts';
export { sessionRefreshRequests } from './refresh';
export {
	findOpenSession,
	isRegisterCounting,
	openSession,
	recordMovement,
	recordApproval,
	RegisterSessionRequiredError,
	requireOpenSession,
	retryMovement,
	readMovement,
	voidMovement,
	setClosureReceiptSnapshot,
	refreshClosureRow,
	recordClosurePrint,
} from './session-store';
export { CLOSURE_DOCUMENT_LIMIT } from '@wcpos/database/collections/schemas/closures';

export {
	observeRegisterSessionAvailability,
	readClosure,
	observeClosures,
	observeClosureRegisterNames,
	observeOpenSessionPresence,
	type ReadonlyClosureDocument,
} from './reads';
export { runRegisterSessionCycle } from './cycle';
export { observeRegisterDrawer, observeRegisterStatus } from './drawer';
export { isLiveMovement } from './drawer-rules';
export { abandonCount, beginCount } from './count';
export { type CloseResult, closeRegister, type RegisterCount } from './close';

export { carryDrawer, CarryAdoptionError, type CarryTarget } from './carry';
