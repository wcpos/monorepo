// GENERATED — do not edit by hand; run pnpm generate:event-labels
import type { SyncEventType } from '@wcpos/utils/logger/generated/event-labels.generated';

/** The translate function shape `useT()` returns. */
type TranslateEvent = (key: string) => string;

/**
 * Merchant-readable title for an engine event, translated at render time.
 * One literal `t()` call per type — a dynamic key is invisible to the string
 * extractor, so translators would never see it.
 *
 * No `defaultValue`: the English catalogue is bundled statically and is the
 * fallback language, and this generator writes those strings into it from the
 * registry. A defaultValue here would be a third copy of every label that
 * nothing renders — and one this generator could silently drift from.
 */
export function translateEventTitle(t: TranslateEvent, type: SyncEventType): string {
	switch (type) {
		case 'apply.barcode-rederive':
			return t('health.logs.event.apply_barcode_rederive');
		case 'apply.delete':
			return t('health.logs.event.apply_delete');
		case 'apply.escalation':
			return t('health.logs.event.apply_escalation');
		case 'apply.pull':
			return t('health.logs.event.apply_pull');
		case 'apply.rebaseline':
			return t('health.logs.event.apply_rebaseline');
		case 'apply.refetch':
			return t('health.logs.event.apply_refetch');
		case 'apply.refresh':
			return t('health.logs.event.apply_refresh');
		case 'coverage.compacted':
			return t('health.logs.event.coverage_compacted');
		case 'coverage.existence-prime':
			return t('health.logs.event.coverage_existence_prime');
		case 'coverage.existence-reconcile':
			return t('health.logs.event.coverage_existence_reconcile');
		case 'coverage.gate.hit':
			return t('health.logs.event.coverage_gate_hit');
		case 'coverage.gate.miss':
			return t('health.logs.event.coverage_gate_miss');
		case 'coverage.ledger-rebuilt':
			return t('health.logs.event.coverage_ledger_rebuilt');
		case 'coverage.require.error':
			return t('health.logs.event.coverage_require_error');
		case 'coverage.require.log':
			return t('health.logs.event.coverage_require_log');
		case 'coverage.require.outcome':
			return t('health.logs.event.coverage_require_outcome');
		case 'demand.activity-counter-underflow':
			return t('health.logs.event.demand_activity_counter_underflow');
		case 'engine.barcode-selector-hydrate-failed':
			return t('health.logs.event.engine_barcode_selector_hydrate_failed');
		case 'engine.collection-reset':
			return t('health.logs.event.engine_collection_reset');
		case 'engine.connectivity-error':
			return t('health.logs.event.engine_connectivity_error');
		case 'engine.disposed':
			return t('health.logs.event.engine_disposed');
		case 'engine.guard':
			return t('health.logs.event.engine_guard');
		case 'engine.lane.tick':
			return t('health.logs.event.engine_lane_tick');
		case 'engine.listener-error':
			return t('health.logs.event.engine_listener_error');
		case 'engine.pos-bootstrap-error':
			return t('health.logs.event.engine_pos_bootstrap_error');
		case 'engine.ready':
			return t('health.logs.event.engine_ready');
		case 'engine.ready-failed':
			return t('health.logs.event.engine_ready_failed');
		case 'engine.ready-stalled':
			return t('health.logs.event.engine_ready_stalled');
		case 'engine.reconnect.retick':
			return t('health.logs.event.engine_reconnect_retick');
		case 'engine.reset-needs-confirmation':
			return t('health.logs.event.engine_reset_needs_confirmation');
		case 'engine.scope-switched':
			return t('health.logs.event.engine_scope_switched');
		case 'maintenance.lane.error':
			return t('health.logs.event.maintenance_lane_error');
		case 'maintenance.lane.tick':
			return t('health.logs.event.maintenance_lane_tick');
		case 'product.browse-window.approximate':
			return t('health.logs.event.product_browse_window_approximate');
		case 'product.browse-window.brand-filter-ignored':
			return t('health.logs.event.product_browse_window_brand_filter_ignored');
		case 'push.aborted':
			return t('health.logs.event.push_aborted');
		case 'push.conflict':
			return t('health.logs.event.push_conflict');
		case 'push.error':
			return t('health.logs.event.push_error');
		case 'push.in_progress':
			return t('health.logs.event.push_in_progress');
		case 'push.outcome':
			return t('health.logs.event.push_outcome');
		case 'push.rejected':
			return t('health.logs.event.push_rejected');
		case 'queue.drain.progress':
			return t('health.logs.event.queue_drain_progress');
		case 'queue.scheduler.drain':
			return t('health.logs.event.queue_scheduler_drain');
		case 'queue.write.annihilate':
			return t('health.logs.event.queue_write_annihilate');
		case 'queue.write.born-twice-requeue':
			return t('health.logs.event.queue_write_born_twice_requeue');
		case 'queue.write.coalesce':
			return t('health.logs.event.queue_write_coalesce');
		case 'queue.write.conflict-transition':
			return t('health.logs.event.queue_write_conflict_transition');
		case 'queue.write.discard-repull-deferred':
			return t('health.logs.event.queue_write_discard_repull_deferred');
		case 'queue.write.drain':
			return t('health.logs.event.queue_write_drain');
		case 'queue.write.enqueued':
			return t('health.logs.event.queue_write_enqueued');
		case 'queue.write.needs-revision':
			return t('health.logs.event.queue_write_needs_revision');
		case 'queue.write.requeue-rebuilt':
			return t('health.logs.event.queue_write_requeue_rebuilt');
		case 'queue.write.reschedule-failed':
			return t('health.logs.event.queue_write_reschedule_failed');
		case 'queue.write.resolve':
			return t('health.logs.event.queue_write_resolve');
		case 'queue.write.tick.error':
			return t('health.logs.event.queue_write_tick_error');
		case 'signal.cursor':
			return t('health.logs.event.signal_cursor');
		case 'signal.cycle':
			return t('health.logs.event.signal_cycle');
		case 'signal.log':
			return t('health.logs.event.signal_log');
		case 'signal.tick.error':
			return t('health.logs.event.signal_tick_error');
		case 'targeted.pull.shortfall-prune':
			return t('health.logs.event.targeted_pull_shortfall_prune');
		case 'transport.request':
			return t('health.logs.event.transport_request');
		default: {
			const exhaustive: never = type;
			return exhaustive;
		}
	}
}
