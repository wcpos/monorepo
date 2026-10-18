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
	voidMovement,
	writeClosure,
} from './session-store';

export {
	createSessionAccountingState,
	observeRegisterSessions,
	observeCashMovements,
	observeRegisterClosures,
	observeSessionAccounting,
} from './reads';
export { runRegisterSessionCycle } from './cycle';
