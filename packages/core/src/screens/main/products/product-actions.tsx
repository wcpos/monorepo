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
import { Button } from '@wcpos/components/button';
import { type EngineRecord, useQueryRuntime, useRecordField } from '@wcpos/query';
import { refreshRecordByWooId } from '@wcpos/query/record-readers';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';
import { requestServerDelete } from '../hooks/mutations/request-server-delete';
import { useUserCapabilities } from '../hooks/use-user-capabilities';

type Catalogue = 'products' | 'variations';
type CatalogueRecord = EngineRecord<'products'> | EngineRecord<'variations'>;
type Callbacks = { onDeleted?: () => void; onSynced?: () => void };

const syncLoggers = {
	products: getLogger(['wcpos', 'products', 'actions', 'sync']),
	variations: getLogger(['wcpos', 'products', 'variation-actions', 'sync']),
};

/** A catalogue record's actions, for its modal's footer (the row only opens it). */
function useCatalogueActions(
	collection: Catalogue,
	record: CatalogueRecord,
	{ onDeleted, onSynced }: Callbacks = {}
) {
	const id = useRecordField(record, ({ payload }) => payload.id);
	const t = useT();
	const runtime = useQueryRuntime();
	const { caps } = useUserCapabilities();
	const [deleteOpen, setDeleteOpen] = React.useState(false);
	const product = collection === 'products';

	const sync = React.useCallback(() => {
		if (!id) return;
		// A pull can resolve without applying the row (the engine keeps a row with pending local
		// work): only a new revision, a new document object, is the store's copy landing.
		const before = record.getLatest();
		void refreshRecordByWooId(runtime.engine, {
			id: `${product ? 'product' : 'variation'}-actions:refresh:${id}`,
			collection,
			wooId: id,
		})
			// Only a refresh that landed hands the form the store's copy.
			.then(() => {
				if (record.getLatest() !== before) onSynced?.();
			})
			.catch((error) => {
				// The engine already wrote the coded row for this require (SYNC321), and the
				// device's copy is untouched: the cashier only needs to know it didn't refresh.
				syncLoggers[collection].debug(`Failed to refresh ${product ? 'product' : 'variation'}`, {
					showToast: true,
					toast: { title: t('common.refresh_failed'), type: 'warning' },
					context: { [product ? 'productId' : 'variationId']: id, error: getErrorMessage(error) },
				});
			});
	}, [id, runtime, t, onSynced, collection, product, record]);

	const confirmDelete = React.useCallback(async () => {
		await requestServerDelete(runtime.engine, { collection, recordId: record.uuid });
		onDeleted?.();
	}, [collection, record.uuid, runtime, onDeleted]);

	return {
		sync,
		canSync: Boolean(id),
		canDelete: product ? caps.canDeleteProducts : caps.canDeleteVariations,
		requestDelete: React.useCallback(() => setDeleteOpen(true), []),
		confirmDelete,
		deleteOpen,
		setDeleteOpen,
	};
}

export const useProductActions = (record: EngineRecord<'products'>, callbacks?: Callbacks) =>
	useCatalogueActions('products', record, callbacks);

export const useVariationActions = (record: EngineRecord<'variations'>, callbacks?: Callbacks) =>
	useCatalogueActions('variations', record, callbacks);

/**
 * The footer's left group: the record's own actions, destructive first (orders #2904), beside
 * the form's Cancel/Save group.
 */
export function RecordFooterActions({
	actions,
	testIDPrefix,
}: {
	actions: ReturnType<typeof useCatalogueActions>;
	testIDPrefix: 'product' | 'variation';
}) {
	const t = useT();
	return (
		<View className="min-w-0 shrink flex-row flex-wrap gap-2">
			{actions.canDelete && (
				<Button
					variant="outline-destructive"
					testID={`${testIDPrefix}-modal-delete`}
					onPress={actions.requestDelete}
				>
					{t('common.delete')}
				</Button>
			)}
			{actions.canSync && (
				<Button variant="outline" testID={`${testIDPrefix}-modal-sync`} onPress={actions.sync}>
					{t('common.sync')}
				</Button>
			)}
		</View>
	);
}

type DialogProps<R> = {
	record: R;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
};

/** The confirm the modal's Delete passes through. */
function DeleteCatalogueDialog({
	collection,
	record,
	open,
	onOpenChange,
	onConfirm,
}: DialogProps<CatalogueRecord> & { collection: Catalogue }) {
	const t = useT();
	const name = useRecordField(record, ({ payload }) => payload.name);
	const product = collection === 'products';
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t('products.delete', { product: name })}</AlertDialogTitle>
					<AlertDialogDescription>
						{/* A variation has no Trash on the server: its copy says so. */}
						{t(
							product ? 'products.are_you_sure_you_want_to' : 'products.are_you_sure_you_want_to_2'
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
					<AlertDialogAction
						testID={product ? 'product-delete-confirm-button' : 'variation-delete-confirm-button'}
						variant="destructive"
						onPress={onConfirm}
					>
						{t('common.delete')}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function DeleteProductDialog(props: DialogProps<EngineRecord<'products'>>) {
	return <DeleteCatalogueDialog collection="products" {...props} />;
}

export function DeleteVariationDialog(props: DialogProps<EngineRecord<'variations'>>) {
	return <DeleteCatalogueDialog collection="variations" {...props} />;
}
