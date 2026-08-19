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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { useQueryRuntime } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { requestServerDelete } from '../../hooks/mutations/request-server-delete';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

const syncLogger = getLogger(['wcpos', 'products', 'variation-actions', 'sync']);

/**
 *
 */
export function VariationActions({
	row,
}: CellContext<{ document: ProductVariationDocument }, 'actions'>) {
	const variation = row.original.document;
	const parentRow = row.getParentRow()!;
	const parent = (parentRow.original as { document: { name: string } }).document;
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const router = useRouter();
	const t = useT();
	const runtime = useQueryRuntime();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();

	const handleRefresh = React.useCallback(() => {
		if (!variation.id) return;
		const handle = runtime.engine.require({
			id: `variation-actions:refresh:${variation.id}`,
			collection: 'variations',
			kind: 'targeted-records',
			remoteIds: [variation.id].map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
			forceRefresh: true,
		});
		void handle.ready
			.finally(() => handle.release())
			.catch((error) => {
				syncLogger.error('Failed to refresh variation', {
					code: ERROR_CODES.PRODUCT_UNEXPECTED,
					showToast: true,
					context: {
						variationId: variation.id,
						error: getErrorMessage(error),
					},
				});
			});
	}, [runtime, variation.id]);

	/**
	 * Handle delete button click
	 */
	const handleDelete = React.useCallback(async () => {
		await requestServerDelete(runtime.engine, {
			collection: 'variations',
			recordId: variation.uuid!,
		});
	}, [runtime, variation.uuid]);

	if (readOnly) {
		return null;
	}

	/**
	 *
	 */
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger testID="variation-actions-menu">
					<Icon name="ellipsisVertical" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<CapabilityTooltip show={!caps.canEditVariations} hint="editProducts">
						<DropdownMenuItem
							disabled={!caps.canEditVariations}
							onPress={() =>
								router.push({
									pathname: `/(app)/(drawer)/products/(modals)/edit/variation/${variation.uuid}`,
								})
							}
						>
							<Icon name="penToSquare" />
							<Text>{t('common.edit')}</Text>
						</DropdownMenuItem>
					</CapabilityTooltip>
					{variation.id && (
						<DropdownMenuItem onPress={handleRefresh}>
							<Icon name="arrowRotateRight" />
							<Text>{t('common.sync')}</Text>
						</DropdownMenuItem>
					)}
					{caps.canDeleteVariations && (
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
			{caps.canDeleteVariations && (
				<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								{t('products.delete', {
									product: `${parent.name} - ${variation.name}`,
								})}
							</AlertDialogTitle>
							<AlertDialogDescription>
								{t('products.are_you_sure_you_want_to_2')}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
							<AlertDialogAction variant="destructive" onPress={handleDelete}>
								{t('common.delete')}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</>
	);
}
