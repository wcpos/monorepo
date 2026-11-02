import { NON_INTERNAL_MUTATION_STATUSES, type QueuedMutation } from '@wcpos/sync-core';

export type QueueRowStatus = Exclude<QueuedMutation['status'], 'internal' | undefined>;
export type QueueRow = Omit<QueuedMutation, 'status'> & { readonly status: QueueRowStatus };
export const QUEUE_ROW_STATUSES = NON_INTERNAL_MUTATION_STATUSES as readonly QueueRowStatus[];
export const TERMINAL_QUEUE_STATUSES = ['conflicted', 'needs-revision', 'rejected'] as const;
export const PARKED_QUEUE_STATUSES = ['conflicted', 'needs-revision'] as const;
export const BACKLOG_QUEUE_STATUSES = ['pending', 'claimed'] as const;
export const REJECTED_QUEUE_STATUSES = ['rejected'] as const;
