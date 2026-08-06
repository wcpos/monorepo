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
 *    accepts the server's version. For a BORN-LOCAL record there is no server
 *    version, so discarding DELETES the record from this device (#832 follow-up,
 *    R7b) — a separate, explicit confirm says exactly that rather than implying
 *    the record survives.
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
					resolution === 'requeue-rebuilt'
						? t('health.database.rejected.requeued')
						: row.destroysRecord
							? // Say what actually happened: discarding a born-local record deletes
								// it, and "Change discarded." would not tell a cashier the sale is gone.
								t('health.database.rejected.destroyed')
							: t('health.database.rejected.discarded'),
			});
		} catch (error) {
			if (error instanceof Error && error.name === 'WritePlaneFollowerError') {
				Toast.show({
					type: 'info',
					text1: t('health.database.rejected.follower_deferred'),
				});
				return;
			}
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
							{row.residentUnknown ? (
								<Text className="text-muted-foreground/80 text-xs">
									{t('health.database.rejected.unknown_record')}
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
								// A failed resident read leaves the destructive outcome UNKNOWN
								// (PR #1016 review): the record may or may not be deleted, so
								// every confirm we could show might be describing the wrong one.
								// Wait for a read that succeeds rather than guess — the feed
								// re-renders on the next queue emission.
								disabled={busyId !== null || row.residentUnknown}
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
						{/* THREE outcomes, because the engine has three (PR #1016 review).
						    A born-local record has no server version to fall back on, so
						    discarding DESTROYS it (#832 follow-up, R7b) and the confirm says
						    so outright. A non-order row WITH a server identity is deleted
						    only if the server no longer has it — unknowable without the
						    request the engine itself makes, so that copy states the
						    condition instead of promising an outcome. Everything else keeps
						    its record. The original copy promised "your server's version is
						    kept" for all three, which was a lie on two of them. */}
						<AlertDialogTitle>
							{discarding?.destroysRecord
								? t('health.database.rejected.discard_destroy_title')
								: discarding?.mayDestroyRecord
									? t('health.database.rejected.discard_maybe_title')
									: t('health.database.rejected.discard_title')}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{discarding?.destroysRecord
								? t('health.database.rejected.discard_destroy_body', {
										record: describeRecord(discarding, t),
									})
								: discarding?.mayDestroyRecord
									? t('health.database.rejected.discard_maybe_body', {
											record: describeRecord(discarding, t),
										})
									: t('health.database.rejected.discard_body')}
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
								{discarding?.destroysRecord
									? t('health.database.rejected.discard_destroy_confirm')
									: t('health.database.rejected.discard_confirm')}
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
