// GENERATED — do not edit by hand; run pnpm generate:event-labels
import type { SyncEventType } from '@wcpos/utils/logger/generated/event-labels.generated';

/** The translate function shape `useT()` returns. */
type TranslateEvent = (key: string, options: { defaultValue: string }) => string;

/**
 * Merchant-readable title for an engine event, translated at render time.
 * One literal `t()` call per type — a dynamic key is invisible to the string
 * extractor, so translators would never see it.
 */
export function translateEventTitle(t: TranslateEvent, type: SyncEventType): string {
	switch (type) {
		case 'apply.barcode-rederive':
			return t('health.logs.event.apply_barcode_rederive', {
				defaultValue: 'Rebuilt barcode lookups',
			});
		case 'apply.delete':
			return t('health.logs.event.apply_delete', {
				defaultValue: 'Removed items deleted in your store',
			});
		case 'apply.escalation':
			return t('health.logs.event.apply_escalation', {
				defaultValue: 'An update from your store could not be saved',
			});
		case 'apply.pull':
			return t('health.logs.event.apply_pull', {
				defaultValue: 'Saved updates from your store',
			});
		case 'apply.rebaseline':
			return t('health.logs.event.apply_rebaseline', {
				defaultValue: 'Refreshed local data from your store',
			});
		case 'apply.refetch':
			return t('health.logs.event.apply_refetch', {
				defaultValue: 'Fetched records again for missing details',
			});
		case 'apply.refresh':
			return t('health.logs.event.apply_refresh', {
				defaultValue: 'Refreshed a list from your store',
			});
		case 'coverage.compacted':
			return t('health.logs.event.coverage_compacted', {
				defaultValue: 'Tidied up local sync bookkeeping',
			});
		case 'coverage.existence-prime':
			return t('health.logs.event.coverage_existence_prime', {
				defaultValue: 'Checked which records exist in your store',
			});
		case 'coverage.existence-reconcile':
			return t('health.logs.event.coverage_existence_reconcile', {
				defaultValue: 'Reconciled this device with your store',
			});
		case 'coverage.gate.hit':
			return t('health.logs.event.coverage_gate_hit', {
				defaultValue: 'Answered a search from data already on this device',
			});
		case 'coverage.gate.miss':
			return t('health.logs.event.coverage_gate_miss', {
				defaultValue: 'Fetched a search from your store',
			});
		case 'coverage.require.error':
			return t('health.logs.event.coverage_require_error', {
				defaultValue: 'Could not load the records this screen needs',
			});
		case 'coverage.require.log':
			return t('health.logs.event.coverage_require_log', {
				defaultValue: 'Record loading detail',
			});
		case 'coverage.require.outcome':
			return t('health.logs.event.coverage_require_outcome', {
				defaultValue: 'Loaded the records this screen needs',
			});
		case 'engine.barcode-selector-hydrate-failed':
			return t('health.logs.event.engine_barcode_selector_hydrate_failed', {
				defaultValue: 'Barcode settings could not be loaded',
			});
		case 'engine.collection-reset':
			return t('health.logs.event.engine_collection_reset', {
				defaultValue: 'Local data was reset',
			});
		case 'engine.connectivity-error':
			return t('health.logs.event.engine_connectivity_error', {
				defaultValue: 'Lost the connection to your store',
			});
		case 'engine.disposed':
			return t('health.logs.event.engine_disposed', {
				defaultValue: 'Syncing stopped',
			});
		case 'engine.guard':
			return t('health.logs.event.engine_guard', {
				defaultValue: 'Sync work stopped because the store changed',
			});
		case 'engine.lane.tick':
			return t('health.logs.event.engine_lane_tick', {
				defaultValue: 'Background sync task finished',
			});
		case 'engine.listener-error':
			return t('health.logs.event.engine_listener_error', {
				defaultValue: 'A sync update could not be delivered to the app',
			});
		case 'engine.pos-bootstrap-error':
			return t('health.logs.event.engine_pos_bootstrap_error', {
				defaultValue: 'Setting up this store failed',
			});
		case 'engine.ready':
			return t('health.logs.event.engine_ready', {
				defaultValue: 'Syncing started',
			});
		case 'engine.ready-failed':
			return t('health.logs.event.engine_ready_failed', {
				defaultValue: 'Syncing could not start',
			});
		case 'engine.ready-stalled':
			return t('health.logs.event.engine_ready_stalled', {
				defaultValue: 'Syncing is taking longer than expected to start',
			});
		case 'engine.reconnect.retick':
			return t('health.logs.event.engine_reconnect_retick', {
				defaultValue: 'Resumed syncing after reconnecting',
			});
		case 'engine.reset-needs-confirmation':
			return t('health.logs.event.engine_reset_needs_confirmation', {
				defaultValue: 'A data reset is waiting for your confirmation',
			});
		case 'engine.scope-switched':
			return t('health.logs.event.engine_scope_switched', {
				defaultValue: 'Switched to another store',
			});
		case 'maintenance.lane.error':
			return t('health.logs.event.maintenance_lane_error', {
				defaultValue: 'A background maintenance task failed',
			});
		case 'maintenance.lane.tick':
			return t('health.logs.event.maintenance_lane_tick', {
				defaultValue: 'Background maintenance ran',
			});
		case 'product.browse-window.approximate':
			return t('health.logs.event.product_browse_window_approximate', {
				defaultValue: 'Product totals are approximate in a catalogue this large',
			});
		case 'push.aborted':
			return t('health.logs.event.push_aborted', {
				defaultValue: 'Sending a change was cancelled',
			});
		case 'push.conflict':
			return t('health.logs.event.push_conflict', {
				defaultValue: 'A change clashed with an edit in your store',
			});
		case 'push.error':
			return t('health.logs.event.push_error', {
				defaultValue: 'Could not send a change to your store',
			});
		case 'push.in_progress':
			return t('health.logs.event.push_in_progress', {
				defaultValue: 'This change was already being sent',
			});
		case 'push.outcome':
			return t('health.logs.event.push_outcome', {
				defaultValue: 'Sent a change to your store',
			});
		case 'push.rejected':
			return t('health.logs.event.push_rejected', {
				defaultValue: 'Your store rejected a change',
			});
		case 'queue.drain.progress':
			return t('health.logs.event.queue_drain_progress', {
				defaultValue: 'Still loading records',
			});
		case 'queue.scheduler.drain':
			return t('health.logs.event.queue_scheduler_drain', {
				defaultValue: 'Background sync finished a batch',
			});
		case 'queue.write.annihilate':
			return t('health.logs.event.queue_write_annihilate', {
				defaultValue: 'A change cancelled itself out before it was sent',
			});
		case 'queue.write.born-twice-requeue':
			return t('health.logs.event.queue_write_born_twice_requeue', {
				defaultValue: 'Queued a change again after a duplicate was created',
			});
		case 'queue.write.coalesce':
			return t('health.logs.event.queue_write_coalesce', {
				defaultValue: 'Merged repeated edits into one update',
			});
		case 'queue.write.conflict-transition':
			return t('health.logs.event.queue_write_conflict_transition', {
				defaultValue: 'Could not settle a clashing change',
			});
		case 'queue.write.discard-repull-deferred':
			return t('health.logs.event.queue_write_discard_repull_deferred', {
				defaultValue: 'Postponed refreshing a record from your store',
			});
		case 'queue.write.drain':
			return t('health.logs.event.queue_write_drain', {
				defaultValue: 'Sent queued changes to your store',
			});
		case 'queue.write.enqueued':
			return t('health.logs.event.queue_write_enqueued', {
				defaultValue: 'Queued a change to send to your store',
			});
		case 'queue.write.needs-revision':
			return t('health.logs.event.queue_write_needs_revision', {
				defaultValue: 'A change needs fixing before it can be sent',
			});
		case 'queue.write.reschedule-failed':
			return t('health.logs.event.queue_write_reschedule_failed', {
				defaultValue: 'Could not schedule another try for a change',
			});
		case 'queue.write.resolve':
			return t('health.logs.event.queue_write_resolve', {
				defaultValue: 'Settled a clashing change',
			});
		case 'queue.write.tick.error':
			return t('health.logs.event.queue_write_tick_error', {
				defaultValue: 'Sending queued changes failed',
			});
		case 'signal.cursor':
			return t('health.logs.event.signal_cursor', {
				defaultValue: 'Sync position moved unexpectedly',
			});
		case 'signal.cycle':
			return t('health.logs.event.signal_cycle', {
				defaultValue: 'Checked your store for changes',
			});
		case 'signal.log':
			return t('health.logs.event.signal_log', {
				defaultValue: 'Change check detail',
			});
		case 'signal.tick.error':
			return t('health.logs.event.signal_tick_error', {
				defaultValue: 'Checking your store for changes failed',
			});
		case 'transport.request':
			return t('health.logs.event.transport_request', {
				defaultValue: 'Request to your store',
			});
		default: {
			const exhaustive: never = type;
			return exhaustive;
		}
	}
}
