import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';

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
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../contexts/translations';
import { FIX_ROUTES } from './attention-panel';
import { Callout, Pill } from './components';
import { useManualSync } from './use-manual-sync';
import { useNowMs, useRelativeTime } from './use-relative-time';
import { type UnresolvedConflict, useUnresolvedConflicts } from './use-unresolved-conflicts';

const logger = getLogger(['wcpos', 'health', 'conflicts']);

/**
 * Store health → Database · "Clashed with an edit in your store".
 *
 * Each row here is a change this device HELD because the server reported a
 * newer copy (a parked 'conflicted'/'needs-revision' queue row). The engine
 * deliberately never auto-resolves these (orders' one ruled carve-out aside,
 * #1204) — a human picks a side — but until this panel the pick-a-side surface
 * did not exist: the only rendering was an anonymous count that called every
 * row a "sale", so a parked product wedged with no way out (dev-next
 * 2026-08-14). The two honest actions, straight from `resolveConflict`:
 *
 *  - Send again: keep THIS device's change — re-anchor to the server's current
 *    revision and queue the same intent. A delete gets the same explicit
 *    confirm discipline as the dead-letter panel's requeue (#1093 audit, Q2):
 *    winning that conflict destroys the record on the server.
 *  - Use server version: drop the local change; the server's copy is re-pulled
 *    durably (the engine queues the re-pull BEFORE removing the mutation, so a
 *    crash cannot leave the record posing as synced). Destructive to the local
 *    edit, so it sits behind a confirm.
 */
export function ConflictedMutationsPanel() {
	const t = useT();
	const router = useRouter();
	const { engine } = useQueryRuntime();
	const { sync } = useManualSync();
	const { rows, readError } = useUnresolvedConflicts();
	const nowMs = useNowMs(30_000);
	const relative = useRelativeTime();
	const [busyId, setBusyId] = React.useState<string | null>(null);
	const [discarding, setDiscarding] = React.useState<UnresolvedConflict | null>(null);
	const [resendingDelete, setResendingDelete] = React.useState<UnresolvedConflict | null>(null);

	// "Cannot read held changes" must never render as "no held changes" — same
	// cashier-full-information ruling the rejected panel follows (2026-08-07).
	if (readError) {
		return (
			<Callout tone="destructive" testID="db-conflicted-read-error">
				<VStack className="gap-0.5">
					<Text className="text-destructive text-sm font-semibold">
						{t('health.database.conflicted.read_error_title')}
					</Text>
					<Text className="text-muted-foreground text-xs">
						{t('health.database.conflicted.read_error_body')}
					</Text>
				</VStack>
			</Callout>
		);
	}

	if (rows.length === 0) return null;

	const settle = async (
		row: UnresolvedConflict,
		resolution: 'retry-with-server-base' | 'discard'
	) => {
		setBusyId(row.mutationId);
		try {
			await engine.resolveConflict(row.mutationId, resolution);
			logger.info('conflict resolved', {
				context: {
					mutationId: row.mutationId,
					collection: row.collectionName,
					recordId: row.recordId,
					resolution,
				},
			});
			Toast.show({
				type: 'success',
				text1:
					resolution === 'retry-with-server-base'
						? t('health.database.conflicted.resent')
						: t('health.database.conflicted.server_kept'),
			});
			if (resolution === 'retry-with-server-base') {
				// The row is back to pending; without a tick it waits for the next
				// scheduled drain, and "Send again" that visibly sends nothing reads
				// as broken. Fire-and-forget: the manual-sync hook narrates failures.
				void sync();
			}
		} catch (error) {
			if (error instanceof Error && error.name === 'WritePlaneFollowerError') {
				Toast.show({
					type: 'info',
					text1: t('health.database.conflicted.follower_deferred'),
				});
				return;
			}
			const message = error instanceof Error ? error.message : String(error);
			logger.error('conflict resolution failed', {
				code: ERROR_CODES.SYNC_UNEXPECTED,
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
						? t('health.database.conflicted.server_kept_failed')
						: t('health.database.conflicted.resend_failed'),
				text2: message,
			});
		} finally {
			setBusyId(null);
		}
	};

	return (
		<VStack testID="db-conflicted" className="gap-2">
			<Callout tone="destructive" testID="db-conflicted-callout">
				<VStack className="gap-0.5">
					<Text className="text-destructive text-sm font-semibold">
						{t('health.database.conflicted.title', {
							count: rows.length,
						})}
					</Text>
					<Text className="text-muted-foreground text-xs">
						{t('health.database.conflicted.body')}
					</Text>
				</VStack>
			</Callout>

			<VStack className="gap-0">
				{rows.map((row) => {
					const fixRoute = FIX_ROUTES[row.collectionName]?.(row.recordId);
					return (
						<HStack
							key={row.mutationId}
							testID={`db-conflicted-row-${row.mutationId}`}
							className="border-border flex-wrap items-center gap-2 border-b py-2"
						>
							<View className="min-w-0 flex-1">
								<HStack className="items-center gap-2">
									<Text className="font-medium">{describeRecord(row, t)}</Text>
									{/* A held DELETE must never look like a held edit: resending it
									    destroys the record on the server (#1093 audit, Q2). */}
									{row.operation === 'delete' ? (
										<Pill tone="destructive" testID={`db-conflicted-delete-${row.mutationId}`}>
											{t('health.database.conflicted.delete_pill')}
										</Pill>
									) : null}
								</HStack>
								<Text className="text-muted-foreground text-xs">
									{t('health.database.conflicted.reason')}
								</Text>
								{row.queuedAt ? (
									<Text className="text-muted-foreground/80 text-xs">
										{t('health.database.conflicted.when', {
											ago: relative(Date.parse(row.queuedAt), nowMs),
										})}
									</Text>
								) : null}
							</View>
							<HStack className="items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									testID={`db-conflicted-resend-${row.mutationId}`}
									disabled={busyId !== null}
									onPress={() =>
										row.operation === 'delete'
											? setResendingDelete(row)
											: void settle(row, 'retry-with-server-base')
									}
								>
									<ButtonText>{t('health.database.conflicted.resend')}</ButtonText>
								</Button>
								<Button
									variant="ghost"
									size="sm"
									testID={`db-conflicted-discard-${row.mutationId}`}
									disabled={busyId !== null}
									onPress={() => setDiscarding(row)}
								>
									<ButtonText className="text-destructive">
										{t('health.database.conflicted.use_server')}
									</ButtonText>
								</Button>
								{fixRoute ? (
									<Button
										variant="ghost"
										size="sm"
										testID={`db-conflicted-open-${row.mutationId}`}
										onPress={() => router.push(fixRoute)}
									>
										<ButtonText className="text-muted-foreground">
											{t('health.database.conflicted.open')}
										</ButtonText>
									</Button>
								) : null}
							</HStack>
						</HStack>
					);
				})}
			</VStack>

			<AlertDialog
				open={resendingDelete !== null}
				onOpenChange={(open: boolean) => {
					if (!open) setResendingDelete(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t('health.database.conflicted.resend_delete_title')}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{resendingDelete
								? t('health.database.conflicted.resend_delete_body', {
										record: describeRecord(resendingDelete, t),
									})
								: null}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel testID="db-conflicted-resend-delete-cancel">
							<Text>{t('common.cancel')}</Text>
						</AlertDialogCancel>
						<AlertDialogAction
							testID="db-conflicted-resend-delete-confirm"
							onPress={() => {
								const row = resendingDelete;
								setResendingDelete(null);
								if (row) void settle(row, 'retry-with-server-base');
							}}
						>
							<Text className="text-destructive">
								{t('health.database.conflicted.resend_delete_confirm')}
							</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={discarding !== null}
				onOpenChange={(open: boolean) => {
					if (!open) setDiscarding(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('health.database.conflicted.use_server_title')}</AlertDialogTitle>
						<AlertDialogDescription>
							{discarding
								? t('health.database.conflicted.use_server_body', {
										record: describeRecord(discarding, t),
									})
								: null}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel testID="db-conflicted-discard-cancel">
							<Text>{t('common.cancel')}</Text>
						</AlertDialogCancel>
						<AlertDialogAction
							testID="db-conflicted-discard-confirm"
							onPress={() => {
								const row = discarding;
								setDiscarding(null);
								if (row) void settle(row, 'discard');
							}}
						>
							<Text className="text-destructive">
								{t('health.database.conflicted.use_server_confirm')}
							</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</VStack>
	);
}

type Translate = ReturnType<typeof useT>;

/** "Products · Aether Gym Pant" — never a bare uuid when anything better exists. */
function describeRecord(row: UnresolvedConflict, t: Translate): string {
	const labelKey = (COLLECTION_VOCABULARY as Record<string, { labelKey?: string } | undefined>)[
		row.collectionName
	]?.labelKey;
	const collection = labelKey ? t(labelKey) : row.collectionName;
	return row.label ? `${collection} · ${row.label}` : `${collection} · ${row.recordId.slice(0, 8)}`;
}
