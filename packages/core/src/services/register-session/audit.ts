import * as React from 'react';

import type { CashMovementRow, ClosureRow, RegisterSessionRow } from '@wcpos/database';
import { getLogger, type LoggerOptions } from '@wcpos/utils/logger';
import {
	ERROR_CATALOGUE,
	ERROR_CODES,
	type ErrorCode,
} from '@wcpos/utils/logger/generated/error-codes.generated';

import { mintUuid } from '../register/register-document';
import { useStoreSession } from '../../contexts/app-state';

import type { failureFacts } from './failure-facts';

const logger = getLogger(['wcpos', 'registerSession']);
const bindingLogger = getLogger(['wcpos', 'register']);
const attempt = () => ({ operationId: mintUuid().replace(/-/g, '') });

export function useRegisterActor() {
	const { wpCredentials } = useStoreSession();
	return React.useMemo(
		() => ({
			id: String(wpCredentials?.id ?? ''),
			name: wpCredentials?.display_name || wpCredentials?.username || '',
		}),
		[wpCredentials?.id, wpCredentials?.display_name, wpCredentials?.username]
	);
}

type Pair = { sessionId: string | undefined; registerId: string | null | undefined };
type Human = Pair & { actor: ReturnType<typeof useRegisterActor> };
type Movement = Pair & {
	movementId: string;
	movementType: CashMovementRow['type'];
	amount: string;
};
type Failure = Partial<
	Pick<ReturnType<typeof failureFacts>, 'status' | 'errorCode' | 'field' | 'message'>
>;
type Document =
	| Pick<RegisterSessionRow, 'id' | 'register_id'>
	| Pick<CashMovementRow, 'id' | 'session_id' | 'type' | 'amount'>
	| Pick<ClosureRow, 'id' | 'session_id' | 'register_id'>;

export type RegisterFact =
	| (Human & {
			kind: 'session-opened';
			amount: string;
			variance: RegisterSessionRow['opening_variance'];
	  })
	| (Human & {
			kind:
				| 'counting-started'
				| 'counting-abandoned'
				| 'approval-refused'
				| 'x-report-dispatched'
				| 'drawer-dispatched';
	  })
	| (Human & { kind: 'session-closed'; closureId: string } & Pick<
				ClosureRow,
				'counted' | 'variance'
			>)
	| (Human & Movement & { kind: 'movement-recorded' })
	| (Human & Movement & { kind: 'movement-voided'; voids: string })
	| (Human & { kind: 'movement-retry-requested'; movementId: string })
	| (Human & { kind: 'approval-granted'; approvedBy: number | null })
	| (Human & { kind: 'variance-over-threshold'; variance: string; threshold: string | undefined })
	| (Pair & Failure & { kind: 'outbox-approval-refused'; sessionId: string; endpoint: string })
	| (Failure & {
			kind: 'outbox-request-failed';
			document: Document;
			registerId?: string;
			endpoint: string;
			retry: boolean;
			persist: boolean;
			takeover: boolean;
			code: ErrorCode;
			attempts: number;
	  })
	| (Pair & { kind: 'session-adopted' | 'session-pruned'; sessionId: string })
	| (Movement & { kind: 'movement-accepted' })
	| ({ kind: 'binding-changed'; registerId: string; previousRegisterId: string | null } & (
			{ source: 'manual'; actor: Human['actor'] } | { source: 'automatic' }
	  ))
	| { kind: 'binding-removed' | 'directory-unavailable'; registerId: string | null }
	| (Failure & {
			kind: 'bridge-cycle-failed';
			registerId: string | null;
			stage: string;
			message: string;
			consecutiveFailures: number;
	  });

/**
 * A distinct human action without its own durable record gets a fresh attempt ID.
 * A durable action or background observation uses the stable ID of its subject so
 * repeat observations can fold. Existing uncorrelated background diagnostics remain
 * foldable without an ID.
 */
function identity(fact: RegisterFact): LoggerOptions['terminal'] {
	let id: string | undefined;
	switch (fact.kind) {
		case 'directory-unavailable':
		case 'binding-removed':
		case 'bridge-cycle-failed':
			return undefined;
		case 'session-opened':
		case 'session-pruned':
			id = fact.sessionId;
			break;
		case 'session-closed':
			id = fact.closureId;
			break;
		case 'movement-recorded':
		case 'movement-voided':
			id = fact.movementId;
			break;
		case 'binding-changed':
			if (fact.source === 'manual') return attempt();
			id = fact.registerId;
			break;
		case 'session-adopted':
		case 'outbox-approval-refused':
			id = fact.sessionId.replace(/-/g, '').slice(0, 32);
			break;
		case 'movement-accepted':
			id = fact.movementId.replace(/-/g, '').slice(0, 32);
			break;
		case 'outbox-request-failed':
			id = fact.document.id.replace(/-/g, '').slice(0, 32);
			break;
		default:
			return attempt();
	}
	return { operationId: id?.replace(/-/g, '') };
}

export function recordRegisterFact(fact: RegisterFact): void {
	const terminal = identity(fact);
	const actor = 'actor' in fact ? { actor: fact.actor } : {};
	const pair =
		'sessionId' in fact ? { sessionId: fact.sessionId, registerId: fact.registerId } : {};
	const emit = (
		message: string,
		type: string,
		context: Record<string, unknown> = {},
		level: 'info' | 'warn' = 'info'
	) => logger[level](message, { ...actor, terminal, context: { type, ...pair, ...context } });
	switch (fact.kind) {
		case 'session-opened':
			return emit('Register session opened', 'register.session-opened', {
				amount: fact.amount,
				variance: fact.variance,
			});
		case 'counting-started':
			return emit('Register session counting started', 'register.counting-started');
		case 'counting-abandoned':
			return emit('Register session counting abandoned', 'register.counting-abandoned');
		case 'session-closed':
			return emit('Register session closed', 'register.session-closed', {
				closureId: fact.closureId,
				counted: fact.counted,
				variance: fact.variance,
			});
		case 'movement-recorded':
			// No-sale is the cashier action, independent of drawer dispatch, and makes no cash claim.
			if (fact.movementType === 'no_sale')
				return emit('Register no-sale recorded', 'register.no-sale-recorded', {
					movementId: fact.movementId,
				});
			return emit('Register cash movement recorded', 'register.movement-recorded', {
				movementId: fact.movementId,
				movementType: fact.movementType,
				amount: fact.amount,
			});
		case 'movement-voided':
			return emit('Register cash movement voided', 'register.movement-voided', {
				movementId: fact.movementId,
				movementType: fact.movementType,
				amount: fact.amount,
				voids: fact.voids,
			});
		case 'movement-retry-requested':
			return emit('Register cash movement retry requested', 'register.movement-retrying', {
				movementId: fact.movementId,
			});
		case 'approval-granted':
			return emit('Register session approval granted', 'register.approval-granted', {
				approvedBy: fact.approvedBy,
			});
		case 'approval-refused':
			return emit('Register session approval refused', 'register.approval-refused', {}, 'warn');
		case 'variance-over-threshold':
			return emit(
				'Register count exceeds variance threshold',
				'register.variance-over-threshold',
				{ variance: fact.variance, threshold: fact.threshold },
				'warn'
			);
		// These prove dispatch success, not that paper printed or a physical drawer opened.
		case 'x-report-dispatched':
			return emit('Register X-report print dispatched', 'register.x-report-printed');
		case 'drawer-dispatched':
			return emit('Register drawer kick dispatched', 'register.drawer-opened');
		case 'outbox-approval-refused':
			return logger.warn('Register session close approval refused', {
				code: ERROR_CODES.REGISTER_APPROVAL_REFUSED,
				context: {
					type: 'register.approval-refused',
					...pair,
					endpoint: fact.endpoint,
					status: fact.status,
					errorCode: fact.errorCode,
					documentId: fact.sessionId,
				},
				terminal: { ...terminal, operationType: 'register.outbox', outcome: 'rejected' },
			});
		case 'outbox-request-failed': {
			const {
				document: row,
				endpoint,
				retry,
				persist,
				takeover,
				code,
				attempts,
				status,
				errorCode,
				field,
				message,
			} = fact;
			// Explicit projection: the cashier's free-text reason must never reach error/Sentry.
			const options = {
				context: {
					...(endpoint === 'movements'
						? persist
							? {}
							: { type: retry ? 'register.movement-retrying' : 'register.movement-rejected' }
						: retry || takeover
							? {}
							: { type: 'register.upload-refused' }),
					sessionId: 'session_id' in row ? row.session_id : row.id,
					...('register_id' in row
						? { registerId: row.register_id }
						: fact.registerId
							? { registerId: fact.registerId }
							: {}),
					...('type' in row
						? { movementId: row.id, movementType: row.type, amount: row.amount }
						: {}),
					...(endpoint === 'closures' ? { closureId: row.id } : {}),
					endpoint,
					status,
					errorCode,
					field,
					message,
					documentId: row.id,
				},
				terminal: {
					...terminal,
					operationType: 'register.outbox',
					attempt: attempts,
					...(retry ? {} : { outcome: takeover ? ('recovered' as const) : ('failed' as const) }),
				},
			};
			if (retry) return logger.debug('Register session outbox request failed', options);
			if (ERROR_CATALOGUE[code].severity === 'error')
				return logger.error('Register session outbox request permanently refused', {
					...options,
					code,
					showToast: ERROR_CATALOGUE[code].dataSafety === 'money-moved',
				});
			return logger.warn('Register session outbox request permanently refused', {
				...options,
				code,
			});
		}
		case 'session-adopted':
			return emit('Register session adopted', 'register.session-adopted');
		case 'movement-accepted':
			return emit('Register cash movement accepted', 'register.movement-accepted', {
				movementId: fact.movementId,
				movementType: fact.movementType,
				amount: fact.amount,
			});
		case 'binding-changed':
			return bindingLogger.info(
				fact.source === 'automatic'
					? fact.previousRegisterId
						? 'Register switched automatically'
						: 'Register bound automatically'
					: fact.previousRegisterId
						? 'Register switched'
						: 'Register bound',
				{
					...actor,
					terminal,
					context: {
						type: fact.previousRegisterId ? 'register.switched' : 'register.bound',
						registerId: fact.registerId,
						previousRegisterId: fact.previousRegisterId,
					},
				}
			);
		case 'binding-removed':
			return bindingLogger.info('Register unbound automatically', {
				context: { type: 'register.unbound', registerId: fact.registerId },
			});
		case 'directory-unavailable':
			return bindingLogger.warn('Register directory unavailable', {
				context: { type: 'register.directory-unavailable', registerId: fact.registerId },
			});
		case 'session-pruned':
			return emit('Register session pruned', 'register.session-pruned');
		case 'bridge-cycle-failed': {
			// No endpoint: drain and refresh each span multiple routes and local storage.
			const { registerId, stage, status, errorCode, message, consecutiveFailures } = fact;
			const options = {
				context: {
					...(stage === 'refresh' ? { type: 'register.session-refresh-failed' } : {}),
					registerId,
					stage,
					status,
					errorCode,
					message,
					consecutiveFailures,
				},
			};
			if (consecutiveFailures > 1)
				return logger.warn('Register session refresh/drain still failing', options);
			return logger.debug('Register session refresh/drain failed', options);
		}
	}
}
