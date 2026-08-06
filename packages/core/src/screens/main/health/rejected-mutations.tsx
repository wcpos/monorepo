import * as React from 'react';
import { View } from 'react-native';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';
import { COLLECTION_VOCABULARY, useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';
import { Callout, Pill } from './components';
import { useNowMs, useRelativeTime } from './use-relative-time';
import { type RejectedMutation, useRejectedMutations } from './use-rejected-mutations';

const logger = getLogger(['wcpos', 'health', 'deadLetters']);

/**
 * Store health → Database · "Never reached your server" (#832).
 *
 * Each row here is a write the server permanently refused. For a CREATE that is
 * a completed sale living only on this device — so the panel is deliberately
 * loud, states the server's own reason, and offers the two honest actions:
 *
 *  - Requeue: rebuild the payload from the record as it stands NOW and send it
 *    again. It is the fix for the whole class where the client or the server has
 *    since been corrected; re-sending the frozen payload would earn the same
 *    refusal forever, which is why the engine rebuilds rather than replays.
 *  - Discard: destructive, behind a confirm — it drops the local change and
 *    accepts the server's version.
 *
 * A row whose record is no longer on this device has nothing to rebuild from, so
 * Requeue is disabled and says so rather than failing on press.
 */
export function RejectedMutationsPanel() {
	const t = useT();
	const { engine } = useQueryRuntime();
	const rows = useRejectedMutations();
	const nowMs = useNowMs(30_000);
	const relative = useRelativeTime();
	const [busyId, setBusyId] = React.useState<string | null>(null);
	const [discarding, setDiscarding] = React.useState<RejectedMutation | null>(null);

	if (rows.length === 0) return null;

	const settle = async (row: RejectedMutation, resolution: 'requeue-rebuilt' | 'discard') => {
		setBusyId(row.mutationId);
		try {
			await engine.resolveConflict(row.mutationId, resolution);
			logger.info('dead letter resolved', {
				context: {
					mutationId: row.mutationId,
					collection: row.collectionName,
					recordId: row.recordId,
					resolution,
					requeueCount: row.requeueCount,
				},
			});
			Toast.show({
				type: 'success',
				text1:
					resolution === 'discard'
						? t('health.database.rejected.discarded')
						: t('health.database.rejected.requeued'),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('dead letter resolution failed', {
				context: {
					mutationId: row.mutationId,
					collection: row.collectionName,
					recordId: row.recordId,
					resolution,
					error: message,
				},
			});
			Toast.show({
				type: 'error',
				text1:
					resolution === 'discard'
						? t('health.database.rejected.discard_failed')
						: t('health.database.rejected.requeue_failed'),
				text2: message,
			});
		} finally {
			setBusyId(null);
		}
	};

	return (
		<VStack testID="db-rejected" className="gap-2">
			<Callout tone="destructive" testID="db-rejected-callout">
				<VStack className="gap-0.5">
					<Text className="text-destructive text-sm font-semibold">
						{t('health.database.rejected.title', {
							count: rows.length,
						})}
					</Text>
					<Text className="text-muted-foreground text-xs">
						{t('health.database.rejected.body')}
					</Text>
				</VStack>
			</Callout>

			<VStack className="gap-0">
				{rows.map((row) => (
					<HStack
						key={row.mutationId}
						testID={`db-rejected-row-${row.mutationId}`}
						className="border-border flex-wrap items-center gap-2 border-b py-2"
					>
						<View className="min-w-0 flex-1">
							<HStack className="items-center gap-2">
								<Text className="font-medium">{describeRecord(row, t)}</Text>
								{row.requeueCount > 0 ? (
									<Pill tone="warning" testID={`db-rejected-tries-${row.mutationId}`}>
										{t('health.database.rejected.tries', {
											count: row.requeueCount,
										})}
									</Pill>
								) : null}
							</HStack>
							<Text className="text-muted-foreground text-xs">{describeReason(row, t)}</Text>
							{row.rejectedAt ? (
								<Text className="text-muted-foreground/80 text-xs">
									{t('health.database.rejected.when', {
										ago: relative(Date.parse(row.rejectedAt), nowMs),
									})}
								</Text>
							) : null}
							{row.residentMissing ? (
								<Text className="text-muted-foreground/80 text-xs">
									{t('health.database.rejected.no_record')}
								</Text>
							) : null}
						</View>
						<HStack className="items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								testID={`db-rejected-requeue-${row.mutationId}`}
								disabled={busyId !== null || row.residentMissing}
								onPress={() => void settle(row, 'requeue-rebuilt')}
							>
								<ButtonText>{t('health.database.rejected.requeue')}</ButtonText>
							</Button>
							<Button
								variant="ghost"
								size="sm"
								testID={`db-rejected-discard-${row.mutationId}`}
								disabled={busyId !== null}
								onPress={() => setDiscarding(row)}
							>
								<ButtonText className="text-destructive">
									{t('health.database.rejected.discard')}
								</ButtonText>
							</Button>
						</HStack>
					</HStack>
				))}
			</VStack>

			<AlertDialog
				open={discarding !== null}
				onOpenChange={(open: boolean) => {
					if (!open) setDiscarding(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('health.database.rejected.discard_title')}</AlertDialogTitle>
						<AlertDialogDescription>
							{t('health.database.rejected.discard_body')}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel testID="db-rejected-discard-cancel">
							<Text>{t('common.cancel')}</Text>
						</AlertDialogCancel>
						<AlertDialogAction
							testID="db-rejected-discard-confirm"
							onPress={() => {
								const row = discarding;
								setDiscarding(null);
								if (row) void settle(row, 'discard');
							}}
						>
							<Text className="text-destructive">
								{t('health.database.rejected.discard_confirm')}
							</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</VStack>
	);
}

type Translate = ReturnType<typeof useT>;

/** "Orders · #1042 · 25.00" — never a bare uuid when anything better exists. */
function describeRecord(row: RejectedMutation, t: Translate): string {
	const labelKey = (COLLECTION_VOCABULARY as Record<string, { labelKey?: string } | undefined>)[
		row.collectionName
	]?.labelKey;
	const collection = labelKey ? t(labelKey) : row.collectionName;
	return row.label ? `${collection} · ${row.label}` : `${collection} · ${row.recordId.slice(0, 8)}`;
}

/** The server's verdict, as literally as it gave it. */
function describeReason(row: RejectedMutation, t: Translate): string {
	const parts = [row.status !== null ? String(row.status) : null, row.reason, row.message].filter(
		(part): part is string => typeof part === 'string' && part !== ''
	);
	return parts.length > 0 ? parts.join(' · ') : t('health.database.rejected.no_reason');
}
