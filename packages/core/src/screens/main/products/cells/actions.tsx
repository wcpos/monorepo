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
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../../contexts/translations';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { requestServerDelete } from '../../hooks/mutations/request-server-delete';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

const syncLogger = getLogger(['wcpos', 'products', 'actions', 'sync']);

export function Actions({ row }: CellContext<{ document: ProductDocument }, 'actions'>) {
	const router = useRouter();
	const product = row.original.document;
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();
	const runtime = useQueryRuntime();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();

	const handleRefresh = React.useCallback(() => {
		if (!product.id) return;
		const handle = runtime.engine.require({
			id: `product-actions:refresh:${product.id}`,
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [product.id],
			forceRefresh: true,
		});
		void handle.ready
			.finally(() => handle.release())
			.catch((error) => {
				syncLogger.error('Failed to refresh product', {
					showToast: true,
					saveToDb: true,
					context: {
						productId: product.id,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			});
	}, [runtime, product.id]);

	/**
	 * Handle delete button click
	 */
	const handleDelete = React.useCallback(async () => {
		await requestServerDelete(runtime.engine, {
			collection: 'products',
			recordId: product.uuid!,
		});
	}, [runtime, product.uuid]);

	if (readOnly) {
		return null;
	}

	/**
	 *
	 */
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<IconButton name="ellipsisVertical" testID="product-actions-button" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<CapabilityTooltip show={!caps.canEditProducts} hint="editProducts">
						<DropdownMenuItem
							disabled={!caps.canEditProducts}
							onPress={() => {
								router.push({
									pathname: `/(app)/(drawer)/products/(modals)/edit/product/${product.uuid}`,
								});
							}}
						>
							<Icon name="penToSquare" />
							<Text>{t('common.edit')}</Text>
						</DropdownMenuItem>
					</CapabilityTooltip>
					{product.id && (
						<DropdownMenuItem onPress={handleRefresh}>
							<Icon name="arrowRotateRight" />
							<Text>{t('common.sync')}</Text>
						</DropdownMenuItem>
					)}
					{caps.canDeleteProducts && (
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
			{caps.canDeleteProducts && (
				<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t('products.delete', { product: product.name })}</AlertDialogTitle>
							<AlertDialogDescription>
								{t('products.are_you_sure_you_want_to')}
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
