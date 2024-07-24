import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import Icon from '@wcpos/components/src/icon';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@wcpos/tailwind/src/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/tailwind/src/dropdown-menu';
import { Text } from '@wcpos/tailwind/src/text';

import DeleteDialog from './delete-dialog';
import { useT } from '../../../../contexts/translations';
import usePullDocument from '../../contexts/use-pull-document';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

const Actions = ({ item: product }: Props) => {
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const navigation = useNavigation();
	const pullDocument = usePullDocument();
	const t = useT();

	/**
	 *
	 */
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger>
					<Icon name="ellipsisVertical" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						onPress={() => navigation.navigate('EditProduct', { productID: product.uuid })}
					>
						<Icon name="penToSquare" />
						<Text>{t('Edit', { _tags: 'core' })}</Text>
					</DropdownMenuItem>
					{product.id && (
						<DropdownMenuItem
							onPress={() => {
								if (product.id) {
									pullDocument(product.id, product.collection);
								}
							}}
						>
							<Icon name="arrowRotateRight" />
							<Text>{t('Sync', { _tags: 'core' })}</Text>
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onPress={() => setDeleteDialogOpened(true)}>
						<Icon name="trash" />
						<Text>{t('Delete', { _tags: 'core' })}</Text>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<Dialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<DialogContent>
					<DeleteDialog product={product} />
				</DialogContent>
			</Dialog>
		</>
	);
};

export default Actions;
