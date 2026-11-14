import * as React from 'react';

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { type EngineRecord, useQueryRuntime, useRecordField } from '@wcpos/query';
import { refreshRecordByWooId } from '@wcpos/query/record-readers';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';
import { requestServerDelete } from '../hooks/mutations/request-server-delete';
import { useUserCapabilities } from '../hooks/use-user-capabilities';

type Catalogue = 'products' | 'variations';
type CatalogueRecord = EngineRecord<'products'> | EngineRecord<'variations'>;
type Callbacks = {
	onDeleted?: () => void;
	onSynced?: () => void;
	/** Land pending autosave before pulling; false stops a pull from resetting over a failed draft. */
	beforeSync?: () => Promise<boolean>;
};

const syncLoggers = {
	products: getLogger(['wcpos', 'products', 'actions', 'sync']),
	variations: getLogger(['wcpos', 'products', 'variation-actions', 'sync']),
};

/** A catalogue record's actions, for its modal's footer (the row only opens it). */
function useCatalogueActions(
	collection: Catalogue,
	record: CatalogueRecord,
	{ onDeleted, onSynced, beforeSync }: Callbacks = {}
) {
	const id = useRecordField(record, ({ payload }) => payload.id);
	const t = useT();
	const runtime = useQueryRuntime();
	const { caps } = useUserCapabilities();
	const [deleteOpen, setDeleteOpen] = React.useState(false);
	const product = collection === 'products';

	const sync = React.useCallback(() => {
		if (!id) return;
		void (async () => {
			if (beforeSync && !(await beforeSync())) return;
			await refreshRecordByWooId(runtime.engine, {
				id: `${product ? 'product' : 'variation'}-actions:refresh:${id}`,
				collection,
				wooId: id,
			})
				// Only the engine's applied answer hands the form the store's copy: a pull can settle
				// with the row kept back for its pending local work.
				.then((applied) => {
					if (applied) onSynced?.();
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
		})();
	}, [id, runtime, t, beforeSync, onSynced, collection, product]);

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
						{product
							? t('products.are_you_sure_you_want_to')
							: t('products.are_you_sure_you_want_to_2')}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter
					cancel={true}
					confirm={{
						label: t('common.delete'),
						testID: product ? 'product-delete-confirm-button' : 'variation-delete-confirm-button',
						destructive: true,
						onPress: onConfirm,
					}}
				/>
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
