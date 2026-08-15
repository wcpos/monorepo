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
		case 'browse-window.backstop-reached':
			return t('health.logs.event.browse_window_backstop_reached');
		case 'browse-window.eviction-skipped':
			return t('health.logs.event.browse_window_eviction_skipped');
		case 'browse-window.lanes-evicted':
			return t('health.logs.event.browse_window_lanes_evicted');
		case 'browse-window.page-budget-reached':
			return t('health.logs.event.browse_window_page_budget_reached');
		case 'browse-window.prefix-invalidated':
			return t('health.logs.event.browse_window_prefix_invalidated');
		case 'cadence.backoff':
			return t('health.logs.event.cadence_backoff');
		case 'cadence.reconfigured':
			return t('health.logs.event.cadence_reconfigured');
		case 'cadence.recovered':
			return t('health.logs.event.cadence_recovered');
		case 'cadence.start':
			return t('health.logs.event.cadence_start');
		case 'connectivity.device-offline':
			return t('health.logs.event.connectivity_device_offline');
		case 'connectivity.restored':
			return t('health.logs.event.connectivity_restored');
		case 'connectivity.website-unreachable':
			return t('health.logs.event.connectivity_website_unreachable');
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
		case 'customer.browse-window.sort-rejected':
			return t('health.logs.event.customer_browse_window_sort_rejected');
		case 'demand.activity-counter-underflow':
			return t('health.logs.event.demand_activity_counter_underflow');
		case 'demand.flood-detected':
			return t('health.logs.event.demand_flood_detected');
		case 'email.queue.deferred':
			return t('health.logs.event.email_queue_deferred');
		case 'email.queue.discarded':
			return t('health.logs.event.email_queue_discarded');
		case 'email.queue.failed':
			return t('health.logs.event.email_queue_failed');
		case 'email.queue.queued':
			return t('health.logs.event.email_queue_queued');
		case 'email.queue.retry':
			return t('health.logs.event.email_queue_retry');
		case 'email.queue.sent':
			return t('health.logs.event.email_queue_sent');
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
		case 'engine.write-leader.degraded':
			return t('health.logs.event.engine_write_leader_degraded');
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
		case 'push.dead-letter-unpersisted':
			return t('health.logs.event.push_dead_letter_unpersisted');
		case 'push.error':
			return t('health.logs.event.push_error');
		case 'push.in_progress':
			return t('health.logs.event.push_in_progress');
		case 'push.money-divergence':
			return t('health.logs.event.push_money_divergence');
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
		case 'queue.write.auto-reverted':
			return t('health.logs.event.queue_write_auto_reverted');
		case 'queue.write.born-twice-requeue':
			return t('health.logs.event.queue_write_born_twice_requeue');
		case 'queue.write.coalesce':
			return t('health.logs.event.queue_write_coalesce');
		case 'queue.write.conflict-recovered':
			return t('health.logs.event.queue_write_conflict_recovered');
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

/** Plain-language detail for quiet events that have one in the registry. */
export function translateEventDescription(
	t: TranslateEvent,
	type: SyncEventType
): string | undefined {
	switch (type) {
		case 'apply.barcode-rederive':
			return t('health.logs.event_description.apply_barcode_rederive');
		case 'apply.delete':
			return t('health.logs.event_description.apply_delete');
		case 'apply.pull':
			return t('health.logs.event_description.apply_pull');
		case 'apply.rebaseline':
			return t('health.logs.event_description.apply_rebaseline');
		case 'apply.refetch':
			return t('health.logs.event_description.apply_refetch');
		case 'connectivity.device-offline':
			return t('health.logs.event_description.connectivity_device_offline');
		case 'connectivity.restored':
			return t('health.logs.event_description.connectivity_restored');
		case 'connectivity.website-unreachable':
			return t('health.logs.event_description.connectivity_website_unreachable');
		case 'coverage.require.outcome':
			return t('health.logs.event_description.coverage_require_outcome');
		case 'demand.flood-detected':
			return t('health.logs.event_description.demand_flood_detected');
		case 'engine.barcode-selector-hydrate-failed':
			return t('health.logs.event_description.engine_barcode_selector_hydrate_failed');
		case 'engine.collection-reset':
			return t('health.logs.event_description.engine_collection_reset');
		case 'engine.connectivity-error':
			return t('health.logs.event_description.engine_connectivity_error');
		case 'engine.lane.tick':
			return t('health.logs.event_description.engine_lane_tick');
		case 'engine.ready':
			return t('health.logs.event_description.engine_ready');
		case 'engine.scope-switched':
			return t('health.logs.event_description.engine_scope_switched');
		case 'engine.write-leader.degraded':
			return t('health.logs.event_description.engine_write_leader_degraded');
		case 'maintenance.lane.error':
			return t('health.logs.event_description.maintenance_lane_error');
		case 'push.conflict':
			return t('health.logs.event_description.push_conflict');
		case 'push.error':
			return t('health.logs.event_description.push_error');
		case 'push.outcome':
			return t('health.logs.event_description.push_outcome');
		case 'push.rejected':
			return t('health.logs.event_description.push_rejected');
		case 'queue.scheduler.drain':
			return t('health.logs.event_description.queue_scheduler_drain');
		case 'queue.write.annihilate':
			return t('health.logs.event_description.queue_write_annihilate');
		case 'queue.write.coalesce':
			return t('health.logs.event_description.queue_write_coalesce');
		case 'queue.write.conflict-recovered':
			return t('health.logs.event_description.queue_write_conflict_recovered');
		case 'queue.write.drain':
			return t('health.logs.event_description.queue_write_drain');
		case 'queue.write.enqueued':
			return t('health.logs.event_description.queue_write_enqueued');
		case 'signal.cursor':
			return t('health.logs.event_description.signal_cursor');
		case 'signal.cycle':
			return t('health.logs.event_description.signal_cycle');
		case 'signal.tick.error':
			return t('health.logs.event_description.signal_tick_error');
		case 'transport.request':
			return t('health.logs.event_description.transport_request');
		default:
			return undefined;
	}
}
