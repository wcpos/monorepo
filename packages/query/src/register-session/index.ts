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
	readClosedElsewhere,
	readLiveSession,
	readRegister,
	recordLiveSession,
	unbindRegister,
} from './register-document';
export type { RegisterCounters, RegisterDocument } from './register-document';
export type { ClosureRow, RegisterSessionRow } from '@wcpos/database';

export { recordRegisterFact, type RegisterFact } from './audit';
export { deriveExpected, deriveDrawerTerms } from './expected';
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
	observeRegisterSessions,
	observeRegisterSessionAvailability,
	readClosure,
	observeClosures,
	observeClosureRegisterNames,
	observeOpenSessionPresence,
	type ReadonlyClosureDocument,
	observeCashMovements,
	observeRegisterClosures,
	observeSessionAccounting,
} from './reads';
export { runRegisterSessionCycle } from './cycle';
export { abandonCount, beginCount } from './count';
export { closeRegister, type RegisterCount } from './close';
export { afterBaseline, baselineContains, outsideBaseline } from './baseline';

export { carryDrawer, CarryAdoptionError, type CarryTarget } from './carry';
