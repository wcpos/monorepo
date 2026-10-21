import * as React from 'react';

import { useRouter } from 'expo-router';
import { decode } from 'html-entities';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Notice } from '@wcpos/components/notice';

import { useT } from '../../../contexts/translations';
import { useRecordEditRoute } from './record-edit-route';
import { useManualSync } from './use-manual-sync';
import { useRecordLabel } from './use-record-label';

import type { StuckRecord } from '../logs/logs-logic';

/**
 * Database-tab attention panel (spec §9): the derived stuck-records view made
 * actionable — server reason, Fix record (when an edit surface exists), Retry
 * (one guarded engine tick re-attempts the queue), View log.
 */
export function AttentionPanel({ stuck }: { stuck: StuckRecord[] }) {
	const t = useT();
	const router = useRouter();
	const { syncing, busy, sync } = useManualSync();
	const first = stuck[0];
	const label = useRecordLabel(first ? first.collection : undefined, first?.recordId);
	const editRoute = useRecordEditRoute();

	if (!first) return null;
	const collectionName = first.collection;

	// From the FOUND record's uuid: a pull-side row's id is the store's
	// numeric id, which no edit screen can open.
	const fixRoute = editRoute(collectionName, label?.status === 'found' ? label.uuid : null);
	// The handle alone when there is one — the sentence around it already says
	// what kind it is; otherwise the shared kind / "not on this device" line.
	// Never the raw id: support reads that from the log row's Details.
	const displayName = label?.handle ?? label?.text ?? collectionName;

	return (
		<Notice
			tone="bad"
			testID="db-attention-panel"
			// count selects the plural; n fills the published catalogues' placeholder.
			title={t('health.database.attention', { count: stuck.length, n: stuck.length })}
			// Decode both server-supplied interpolations; only a push is an upload.
			description={decode(
				t(
					first.status === 'deleted'
						? 'health.database.attention_reason_delete'
						: first.direction === 'pull'
							? 'health.database.attention_reason_pull'
							: 'health.database.attention_reason',
					{ name: displayName, reason: first.reason }
				)
			)}
		>
			<HStack className="items-center gap-1">
					{fixRoute ? (
						<Button
							variant="ghost"
							size="sm"
							testID="db-attention-fix"
							onPress={() => router.push(fixRoute)}
						>
							<ButtonText>{t('health.database.attention_fix')}</ButtonText>
						</Button>
					) : null}
					{first.retryable ? (
						<Button
							// Retry is the one constructive action of the row: default, sm.
							size="sm"
							testID="db-attention-retry"
							loading={syncing}
							disabled={busy}
							onPress={() => void sync()}
						>
							<ButtonText>{t('health.database.attention_retry')}</ButtonText>
						</Button>
					) : null}
					<Button
						variant="ghost"
						size="sm"
						testID="db-attention-view-log"
						onPress={() => router.push('/health/logs')}
					>
						<ButtonText>{t('health.database.attention_view_log')}</ButtonText>
					</Button>
			</HStack>
		</Notice>
	);
}
