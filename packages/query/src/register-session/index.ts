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
