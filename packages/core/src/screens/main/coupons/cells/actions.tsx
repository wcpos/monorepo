import * as React from 'react';

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
import { Checkbox } from '@wcpos/components/checkbox';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Label } from '@wcpos/components/label';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { requestServerDelete } from '../../hooks/mutations/request-server-delete';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

import type { CellContext } from '@tanstack/react-table';

type CouponDocument = import('@wcpos/database').CouponDocument;

const syncLogger = getLogger(['wcpos', 'coupons', 'actions', 'sync']);

export function Actions({ row }: CellContext<{ document: CouponDocument }, 'actions'>) {
	const coupon = row.original.document;
	const router = useRouter();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();
	const initialForce = !coupon.id;
	const [force, setForce] = React.useState(initialForce);
	const runtime = useQueryRuntime();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();

	const handleRefresh = React.useCallback(() => {
		const handle = runtime.engine.require({
			id: 'coupon-actions:refresh',
			collection: 'coupons',
			kind: 'refresh',
			forceRefresh: true,
		});
		void handle.ready
			.finally(() => handle.release())
			.catch((error) => {
				syncLogger.error('Failed to refresh coupons', {
					code: ERROR_CODES.SYNC_UNEXPECTED,
					showToast: true,
					context: {
						error: error instanceof Error ? error.message : String(error),
					},
				});
			});
	}, [runtime]);

	const handleDelete = React.useCallback(async () => {
		await requestServerDelete(runtime.engine, {
			collection: 'coupons',
			recordId: coupon.uuid!,
		});
	}, [coupon.uuid, runtime]);

	if (readOnly) {
		return null;
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<IconButton name="ellipsisVertical" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<CapabilityTooltip show={!caps.canEditCoupons} hint="editCoupons">
						<DropdownMenuItem
							disabled={!caps.canEditCoupons}
							onPress={() =>
								router.push({
									pathname: `/coupons/edit/${coupon.uuid}`,
								})
							}
						>
							<Icon name="penToSquare" />
							<Text>{t('common.edit')}</Text>
						</DropdownMenuItem>
					</CapabilityTooltip>
					{coupon.id && (
						<DropdownMenuItem onPress={handleRefresh}>
							<Icon name="arrowRotateRight" />
							<Text>{t('common.sync')}</Text>
						</DropdownMenuItem>
					)}
					{caps.canDeleteCoupons && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem variant="destructive" onPress={() => setDeleteDialogOpened(true)}>
								<Icon
									name="trash"
									className="fill-destructive web:group-focus:fill-accent-foreground"
								/>
								<Text>{t('common.delete')}</Text>
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			{caps.canDeleteCoupons && (
				<AlertDialog
					open={deleteDialogOpened}
					onOpenChange={(open) => {
						setDeleteDialogOpened(open);
						if (open) {
							setForce(initialForce);
						}
					}}
				>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t('coupons.delete', { name: coupon.code })}</AlertDialogTitle>
							<AlertDialogDescription>
								<VStack>
									<Text className="text-destructive">{t('coupons.are_you_sure_you_want_to')}</Text>
									<HStack>
										<Checkbox
											aria-labelledby="confirm"
											onCheckedChange={setForce}
											checked={force}
										/>
										<Label
											nativeID="confirm"
											onPress={() => {
												setForce(!force);
											}}
										>
											{t('coupons.confirm')}
										</Label>
									</HStack>
								</VStack>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
							<AlertDialogAction variant="destructive" disabled={!force} onPress={handleDelete}>
								{t('common.delete')}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</>
	);
}
