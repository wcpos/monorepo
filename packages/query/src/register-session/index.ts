export {
	adoptCounters,
	advancePerpetual,
	bindRegister,
	ensureRegister,
	getBoundRegisterId,
	getCurrentBoundRegisterId,
	getRegisterId,
	getRegisterSnapshot,
	mintClosureNumber,
	mintUuid,
	nextSaleCounter,
	observeRegister$,
	readBoundRegister,
	readCounters,
	readRegister,
	settleRegister,
	unbindRegister,
} from './register-document';
export type { RegisterCounters, RegisterDocument } from './register-document';
export type {
	CashMovementRow,
	ClosureRow,
	RefundDocumentType,
	RegisterSessionRow,
} from '@wcpos/database';

export { recordRegisterFact, type RegisterFact } from './audit';
export {
	attributeRefunds,
	deriveExpected,
	deriveDrawerTerms,
	deriveUnsyncedDelta,
} from './expected';
export { failureFacts } from './failure-facts';
export { adoptSession, drainRegisterSessionQueue, type SessionHttp } from './queue';
export { refreshSessions, sessionRefreshRequests } from './refresh';
export {
	backToSelling,
	closeSession,
	findOpenSession,
	openSession,
	openSessionSelector,
	recordMovement,
	recordApproval,
	RegisterSessionRequiredError,
	requireOpenSession,
	retryMovement,
	startCounting,
	readMovement,
	voidMovement,
	writeClosure,
	setClosureReceiptSnapshot,
	refreshClosureRow,
	recordClosurePrint,
} from './session-store';
export { CLOSURE_DOCUMENT_LIMIT } from '@wcpos/database/collections/schemas/closures';

export {
	createSessionAccountingState,
	observeRegisterSessions,
	observeRegisterSessionAvailability,
	observeClosure,
	readClosure,
	observeClosures,
	observeOpenSessionPresence,
	type ReadonlyClosureDocument,
	observeCashMovements,
	observeRegisterClosures,
	observeSessionAccounting,
} from './reads';
export { runRegisterSessionCycle } from './cycle';
