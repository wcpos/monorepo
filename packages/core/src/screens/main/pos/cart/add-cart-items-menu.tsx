import * as React from 'react';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { AddCoupon } from './add-coupon';
import { AddCustomerDialog } from './add-customer';
import { AddFee } from './add-fee';
import { AddMiscProduct } from './add-misc-product';
import { AddShipping } from './add-shipping';
import { useT } from '../../../../contexts/translations';
import { useLicense } from '../../hooks/use-license';

type DialogType = 'customer' | 'misc-product' | 'fee' | 'shipping' | 'coupon' | null;

export function AddCartItemsMenu() {
	const t = useT();
	const { isPro } = useLicense();
	const [openDialog, setOpenDialog] = React.useState<DialogType>(null);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<IconButton name="plus" testID="add-cart-item-menu" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" portalHost="pos">
					{isPro ? (
						<DropdownMenuItem testID="menu-add-customer" onPress={() => setOpenDialog('customer')}>
							<Icon name="userPlus" />
							<Text>{t('common.add_new_customer')}</Text>
						</DropdownMenuItem>
					) : (
						<Tooltip>
							<TooltipTrigger asChild>
								<DropdownMenuItem testID="menu-add-customer" disabled>
									<Icon name="userPlus" />
									<Text>{t('common.add_new_customer')}</Text>
								</DropdownMenuItem>
							</TooltipTrigger>
							<TooltipContent>
								<Text>{t('common.upgrade_to_pro')}</Text>
							</TooltipContent>
						</Tooltip>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						testID="menu-add-misc-product"
						onPress={() => setOpenDialog('misc-product')}
					>
						<Icon name="circlePlus" />
						<Text>{t('pos_cart.add_miscellaneous_product')}</Text>
					</DropdownMenuItem>
					<DropdownMenuItem testID="menu-add-fee" onPress={() => setOpenDialog('fee')}>
						<Icon name="circlePlus" />
						<Text>{t('pos_cart.add_fee')}</Text>
					</DropdownMenuItem>
					<DropdownMenuItem testID="menu-add-shipping" onPress={() => setOpenDialog('shipping')}>
						<Icon name="circlePlus" />
						<Text>{t('pos_cart.add_shipping')}</Text>
					</DropdownMenuItem>
					{isPro ? (
						<DropdownMenuItem testID="menu-add-coupon" onPress={() => setOpenDialog('coupon')}>
							<Icon name="circlePlus" />
							<Text>{t('pos_cart.add_coupon', { defaultValue: 'Add Coupon' })}</Text>
						</DropdownMenuItem>
					) : (
						<Tooltip>
							<TooltipTrigger asChild>
								<DropdownMenuItem testID="menu-add-coupon" disabled>
									<Icon name="circlePlus" />
									<Text>{t('pos_cart.add_coupon', { defaultValue: 'Add Coupon' })}</Text>
								</DropdownMenuItem>
							</TooltipTrigger>
							<TooltipContent>
								<Text>{t('common.upgrade_to_pro')}</Text>
							</TooltipContent>
						</Tooltip>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Add New Customer dialog — uses its own internal form/state */}
			<AddCustomerDialog
				open={openDialog === 'customer'}
				onOpenChange={(open) => !open && setOpenDialog(null)}
			/>

			{/* Misc product dialog */}
			<Dialog
				open={openDialog === 'misc-product'}
				onOpenChange={(open) => !open && setOpenDialog(null)}
			>
				<DialogContent size="lg" portalHost="pos">
					<DialogHeader>
						<DialogTitle>{t('pos_cart.add_miscellaneous_product')}</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<ErrorBoundary>
							<AddMiscProduct />
						</ErrorBoundary>
					</DialogBody>
				</DialogContent>
			</Dialog>

			{/* Fee dialog */}
			<Dialog open={openDialog === 'fee'} onOpenChange={(open) => !open && setOpenDialog(null)}>
				<DialogContent size="lg" portalHost="pos">
					<DialogHeader>
						<DialogTitle>{t('pos_cart.add_fee')}</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<ErrorBoundary>
							<AddFee />
						</ErrorBoundary>
					</DialogBody>
				</DialogContent>
			</Dialog>

			{/* Shipping dialog */}
			<Dialog
				open={openDialog === 'shipping'}
				onOpenChange={(open) => !open && setOpenDialog(null)}
			>
				<DialogContent size="lg" portalHost="pos">
					<DialogHeader>
						<DialogTitle>{t('pos_cart.add_shipping')}</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<ErrorBoundary>
							<AddShipping />
						</ErrorBoundary>
					</DialogBody>
				</DialogContent>
			</Dialog>

			{/* Coupon dialog */}
			<Dialog open={openDialog === 'coupon'} onOpenChange={(open) => !open && setOpenDialog(null)}>
				<DialogContent size="lg" portalHost="pos">
					<DialogHeader>
						<DialogTitle>{t('pos_cart.add_coupon', { defaultValue: 'Add Coupon' })}</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<ErrorBoundary>
							<AddCoupon />
						</ErrorBoundary>
					</DialogBody>
				</DialogContent>
			</Dialog>
		</>
	);
}
