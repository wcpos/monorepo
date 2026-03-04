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
import { useProAccess } from '../../contexts/pro-access';
import { useDeleteDocument } from '../../contexts/use-delete-document';
import { usePullDocument } from '../../contexts/use-pull-document';

import type { CellContext } from '@tanstack/react-table';

type CouponDocument = import('@wcpos/database').CouponDocument;

export function Actions({ row }: CellContext<{ document: CouponDocument }, 'actions'>) {
	const coupon = row.original.document;
	const router = useRouter();
	const pullDocument = usePullDocument();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();
	const initialForce = !coupon.id;
	const [force, setForce] = React.useState(initialForce);
	const deleteDocument = useDeleteDocument();
	const { readOnly } = useProAccess();

	const handleDelete = React.useCallback(async () => {
		try {
			if (coupon.id) {
				await deleteDocument(coupon.id, coupon.collection as never, { force });
			}
			await coupon.getLatest().remove();
		} finally {
			// close handled by dialog
		}
	}, [coupon, deleteDocument, force]);

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
					<DropdownMenuItem
						onPress={() =>
							router.push({
								pathname: `/coupons/edit/${coupon.uuid}`,
							})
						}
					>
						<Icon name="penToSquare" />
						<Text>{t('common.edit')}</Text>
					</DropdownMenuItem>
					{coupon.id && (
						<DropdownMenuItem
							onPress={() => {
								if (coupon.id) {
									pullDocument(coupon.id, coupon.collection as never);
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
									<Checkbox aria-labelledby="confirm" onCheckedChange={setForce} checked={force} />
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
		</>
	);
}
