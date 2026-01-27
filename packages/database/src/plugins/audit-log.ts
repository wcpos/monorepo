import { RxCollection, RxDocument, RxPlugin } from 'rxdb';

/**
 * Audit Log Plugin
 *
 * Automatically logs all document changes (insert, update, delete) across collections.
 * This provides a complete audit trail without requiring manual logging calls.
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
const DEFAULT_EXCLUDE_FIELDS = ['_rev', '_deleted', '_attachments', 'date_modified', 'date_modified_gmt'];

/**
 * Calculate which fields changed between two document states
 */
function calculateChanges(
	before: Record<string, any>,
	after: Record<string, any>,
	excludeFields: string[]
): Record<string, { old: any; new: any }> | null {
	const changes: Record<string, { old: any; new: any }> = {};

	const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

	for (const key of allKeys) {
		if (excludeFields.includes(key)) continue;
		if (key.startsWith('_')) continue; // Skip internal RxDB fields

		const beforeVal = before[key];
		const afterVal = after[key];

		// Use JSON comparison for deep equality
		if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
			changes[key] = { old: beforeVal, new: afterVal };
		}
	}

	return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Get a human-readable identifier for the document
 */
function getDocumentIdentifier(collection: RxCollection, doc: RxDocument): string {
	const primary = doc.primary;
	const data = doc.toJSON();

	// Try to get a meaningful name based on collection type
	switch (collection.name) {
		case 'products':
		case 'variations':
			return data.name || `#${data.id || primary}`;
		case 'orders':
			return `#${data.number || data.id || primary}`;
		case 'customers':
			return data.email || `${data.first_name || ''} ${data.last_name || ''}`.trim() || `#${data.id || primary}`;
		default:
			return data.name || data.title || `#${data.id || primary}`;
	}
}

/**
 * Log an audit event to the logs collection
 */
async function logAuditEvent(
	collection: RxCollection,
	operation: 'insert' | 'update' | 'delete',
	doc: RxDocument,
	data: {
		before?: Record<string, any>;
		after?: Record<string, any>;
		changes?: Record<string, { old: any; new: any }>;
	}
): Promise<void> {
	// Get logs collection from the same database
	const logsCollection = collection.database.collections?.logs;
	if (!logsCollection) {
		// Logs collection not available (might be different database type)
		return;
	}

	const identifier = getDocumentIdentifier(collection, doc);
	const docData = doc.toJSON();

	try {
		await logsCollection.insert({
			timestamp: Date.now(),
			level: 'audit',
			code: `AUDIT_${operation.toUpperCase()}`,
			message: `${collection.name} ${operation}: ${identifier}`,
			context: {
				operation,
				collection: collection.name,
				documentId: doc.primary,
				// Include server ID if available (for synced documents)
				serverId: docData.id || null,
				...data,
			},
		});
	} catch (e) {
		// Don't let audit logging errors break the main operation
		console.error('[AuditLog] Failed to write audit log:', e);
	}
}

/**
 * WeakMap to store document state before save operations
 * This allows us to calculate what changed during an update
 */
const documentStatesBeforeSave = new WeakMap<RxDocument, Record<string, any>>();

export const RxDBAuditLogPlugin: RxPlugin = {
	name: 'audit-log',
	rxdb: true,
	prototypes: {},
	overwritable: {},

	hooks: {
		createRxCollection: {
			after({ collection }) {
				// Skip excluded collections
				if (DEFAULT_EXCLUDE_COLLECTIONS.includes(collection.name)) {
					return;
				}

				// Check if audit logging is explicitly disabled for this collection
				const options: AuditLogOptions = collection.options?.auditLog || {};
				if (options.enabled === false) {
					return;
				}

				const excludeFields = [...DEFAULT_EXCLUDE_FIELDS, ...(options.excludeFields || [])];

				/**
				 * Before save - capture current document state
				 * This runs BEFORE the document is modified, so we can compare before/after
				 */
				collection.preSave(function (data: any, doc: RxDocument) {
					// Store the current state before the save
					documentStatesBeforeSave.set(doc, doc.toJSON());
					return data;
				}, false);

				/**
				 * After insert - log new document creation
				 */
				collection.postInsert(function (data: any, doc: RxDocument) {
					logAuditEvent(collection, 'insert', doc, {
						after: doc.toJSON(),
					});
				}, false);

				/**
				 * After save (update) - log document changes
				 */
				collection.postSave(function (data: any, doc: RxDocument) {
					const before = documentStatesBeforeSave.get(doc);
					const after = doc.toJSON();

					if (before) {
						const changes = calculateChanges(before, after, excludeFields);

						// Only log if there were actual changes (excluding filtered fields)
						if (changes) {
							logAuditEvent(collection, 'update', doc, {
								before,
								after,
								changes,
							});
						}

						// Clean up stored state
						documentStatesBeforeSave.delete(doc);
					}
				}, false);

				/**
				 * After remove - log document deletion
				 */
				collection.postRemove(function (data: any, doc: RxDocument) {
					logAuditEvent(collection, 'delete', doc, {
						before: doc.toJSON(),
					});
				}, false);
			},
		},
	},
};

export default RxDBAuditLogPlugin;
