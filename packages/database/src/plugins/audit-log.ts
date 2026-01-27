import isEqual from 'lodash/isEqual';
import { RxChangeEvent, RxCollection, RxPlugin } from 'rxdb';
import { Subscription } from 'rxjs';

/**
 * Audit Log Plugin
 *
 * Automatically logs all document changes (insert, update, delete) across collections.
 * This provides a complete audit trail without requiring manual logging calls.
 *
 * Uses RxDB's Observable streams (insert$, update$, remove$) instead of hooks
 * for more reliable change tracking, especially with bulk operations.
 *
 * Configuration:
 * - Enable/disable per collection via collection.options.auditLog
 * - Exclude specific collections (e.g., logs, sync)
 * - Exclude specific fields from change tracking
 */

interface AuditLogOptions {
	enabled?: boolean;
	excludeFields?: string[];
}

const DEFAULT_EXCLUDE_COLLECTIONS = ['logs', 'sync', 'notifications'];
const EXCLUDE_COLLECTION_PATTERNS = [
	/flexsearch$/, // Exclude flexsearch index collections
	/^rx-state/, // Exclude RxDB internal state collections
];
const DEFAULT_EXCLUDE_FIELDS = [
	'_rev',
	'_deleted',
	'_attachments',
	'_meta',
	'date_modified',
	'date_modified_gmt',
];

// Store subscriptions so they can be cleaned up
const collectionSubscriptions = new Map<string, Subscription[]>();

/**
 * Calculate which fields changed between two document states
 */
function calculateChanges(
	before: Record<string, any>,
	after: Record<string, any>,
	excludeFields: string[]
): Record<string, { old: any; new: any }> | null {
	const changes: Record<string, { old: any; new: any }> = {};

	const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

	for (const key of allKeys) {
		if (excludeFields.includes(key)) continue;
		if (key.startsWith('_')) continue; // Skip internal RxDB fields

		const beforeVal = before?.[key];
		const afterVal = after?.[key];

		// Use lodash isEqual for deep equality (ignores key order)
		if (!isEqual(beforeVal, afterVal)) {
			changes[key] = { old: beforeVal, new: afterVal };
		}
	}

	return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Get a human-readable identifier for the document from plain data
 */
function getDocumentIdentifier(collectionName: string, data: Record<string, any>): string {
	// Try to get a meaningful name based on collection type
	switch (collectionName) {
		case 'products':
		case 'variations':
			return data?.name || `#${data?.id || data?.uuid || 'unknown'}`;
		case 'orders':
			return `#${data?.number || data?.id || data?.uuid || 'unknown'}`;
		case 'customers':
			return (
				data?.email ||
				`${data?.first_name || ''} ${data?.last_name || ''}`.trim() ||
				`#${data?.id || data?.uuid || 'unknown'}`
			);
		default:
			return data?.name || data?.title || `#${data?.id || data?.uuid || 'unknown'}`;
	}
}

/**
 * Log an audit event to the logs collection
 */
async function logAuditEvent(
	collection: RxCollection,
	operation: 'insert' | 'update' | 'delete',
	data: {
		documentId: string;
		before?: Record<string, any>;
		after?: Record<string, any>;
		changes?: Record<string, { old: any; new: any }> | null;
	}
): Promise<void> {
	// Get logs collection from the same database
	const logsCollection = collection.database.collections?.logs;
	if (!logsCollection) {
		// Logs collection not available (might be different database type)
		return;
	}

	const docData = data.after || data.before || {};
	const identifier = getDocumentIdentifier(collection.name, docData);

	try {
		await logsCollection.insert({
			timestamp: Date.now(),
			level: 'audit',
			code: `AUDIT_${operation.toUpperCase()}`,
			message: `${collection.name} ${operation}: ${identifier}`,
			context: {
				operation,
				collection: collection.name,
				documentId: data.documentId,
				// Include server ID if available (for synced documents)
				serverId: docData.id || null,
				...(data.before && { before: data.before }),
				...(data.after && { after: data.after }),
				...(data.changes && { changes: data.changes }),
			},
		});
	} catch (e) {
		// Don't let audit logging errors break the main operation
		console.error('[AuditLog] Failed to write audit log:', e);
	}
}

/**
 * Set up audit logging subscriptions for a collection
 */
function setupAuditSubscriptions(collection: RxCollection, excludeFields: string[]): void {
	const subscriptions: Subscription[] = [];
	const collectionKey = `${collection.database.name}-${collection.name}`;

	// Clean up any existing subscriptions for this collection
	const existingSubs = collectionSubscriptions.get(collectionKey);
	if (existingSubs) {
		existingSubs.forEach((sub) => sub.unsubscribe());
	}

	// Subscribe to insert events
	const insertSub = collection.insert$.subscribe((changeEvent: RxChangeEvent<any>) => {
		const documentData = changeEvent.documentData;
		const documentId = changeEvent.documentId;

		logAuditEvent(collection, 'insert', {
			documentId,
			after: documentData,
		});
	});
	subscriptions.push(insertSub);

	// Subscribe to update events
	const updateSub = collection.update$.subscribe((changeEvent: RxChangeEvent<any>) => {
		const documentData = changeEvent.documentData;
		const previousData = changeEvent.previousDocumentData;
		const documentId = changeEvent.documentId;

		// Calculate what changed
		const changes = calculateChanges(previousData || {}, documentData || {}, excludeFields);

		// Only log if there were actual changes (excluding filtered fields)
		if (changes) {
			logAuditEvent(collection, 'update', {
				documentId,
				before: previousData,
				after: documentData,
				changes,
			});
		}
	});
	subscriptions.push(updateSub);

	// Subscribe to remove events
	const removeSub = collection.remove$.subscribe((changeEvent: RxChangeEvent<any>) => {
		const documentData = changeEvent.documentData;
		const documentId = changeEvent.documentId;

		logAuditEvent(collection, 'delete', {
			documentId,
			before: documentData,
		});
	});
	subscriptions.push(removeSub);

	// Store subscriptions for cleanup
	collectionSubscriptions.set(collectionKey, subscriptions);
}

export const RxDBAuditLogPlugin: RxPlugin = {
	name: 'audit-log',
	rxdb: true,
	prototypes: {},
	overwritable: {},

	hooks: {
		createRxCollection: {
			after({ collection }) {
				// Skip excluded collections by exact name
				if (DEFAULT_EXCLUDE_COLLECTIONS.includes(collection.name)) {
					return;
				}

				// Skip excluded collections by pattern (e.g., flexsearch index collections)
				if (EXCLUDE_COLLECTION_PATTERNS.some((pattern) => pattern.test(collection.name))) {
					return;
				}

				// Check if audit logging is explicitly disabled for this collection
				const options: AuditLogOptions = collection.options?.auditLog || {};
				if (options.enabled === false) {
					return;
				}

				const excludeFields = [...DEFAULT_EXCLUDE_FIELDS, ...(options.excludeFields || [])];

				// Set up Observable subscriptions for this collection
				setupAuditSubscriptions(collection, excludeFields);
			},
		},
	},
};

export default RxDBAuditLogPlugin;

// Export for testing
export {
	calculateChanges,
	getDocumentIdentifier,
	DEFAULT_EXCLUDE_COLLECTIONS,
	EXCLUDE_COLLECTION_PATTERNS,
};
