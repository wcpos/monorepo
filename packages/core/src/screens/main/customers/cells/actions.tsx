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

import { useT } from '../../../../contexts/translations';
import { useDeleteDocument } from '../../contexts/use-delete-document';
import { usePullDocument } from '../../contexts/use-pull-document';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';

import type { CellContext } from '@tanstack/react-table';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

/**
 *
 */
export function Actions({ row }: CellContext<{ document: CustomerDocument }, 'actions'>) {
	const customer = row.original.document;
	const router = useRouter();
	const pullDocument = usePullDocument();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();
	const { format } = useCustomerNameFormat();
	const [force, setForce] = React.useState(!customer.id);
	const deleteDocument = useDeleteDocument();

	/**
	 * Handle delete button click
	 */
	const handleDelete = React.useCallback(async () => {
		try {
			if (customer.id) {
				await deleteDocument(customer.id, customer.collection as never, { force });
			}
			await customer.getLatest().remove();
		} finally {
			// @TODO - add button loading state and close
			// setDeleteDialogOpened(false);
		}
	}, [customer, deleteDocument, force]);

	/**
	 *
	 */
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<IconButton name="ellipsisVertical" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						onPress={() =>
							router.push({
								pathname: `/customers/edit/${customer.uuid}`,
							})
						}
					>
						<Icon name="penToSquare" />
						<Text>{t('common.edit')}</Text>
					</DropdownMenuItem>
					{customer.id && (
						<DropdownMenuItem
							onPress={() => {
								if (customer.id) {
									pullDocument(customer.id, customer.collection as never);
								}
							}}
						>
							<Icon name="arrowRotateRight" />
							<Text>{t('common.sync')}</Text>
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onPress={() => setDeleteDialogOpened(true)}>
						<Icon
							name="trash"
							className="fill-destructive web:group-focus:fill-accent-foreground"
						/>
						<Text>{t('common.delete')}</Text>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t('customers.delete', {
								name: format(customer),
							})}
						</AlertDialogTitle>
						<AlertDialogDescription>
							<VStack>
								<Text className="text-destructive">{t('customers.are_you_sure_you_want_to')}</Text>
								<HStack>
									<Checkbox aria-labelledby="confirm" onCheckedChange={setForce} checked={force} />
									<Label
										nativeID="confirm"
										onPress={() => {
											setForce(!force);
										}}
									>
										{t('customers.confirm')}
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
		</>
	);
}
