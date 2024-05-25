import * as React from 'react';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

import { AddCartItemButton } from './add-cart-item-button';
import { AddFeeModal } from './add-fee-modal';
import { AddMiscProductModal } from './add-misc-product-modal';
import { AddShippingModal } from './add-shipping-modal';
import { useT } from '../../../../contexts/translations';

export const AddCartItemButtons = () => {
	const t = useT();

	return (
		<>
			<Box>
				<ErrorBoundary>
					<AddCartItemButton
						label={t('Add Miscellaneous Product', { _tags: 'core' })}
						Modal={AddMiscProductModal}
					/>
				</ErrorBoundary>
			</Box>
			<Box>
				<ErrorBoundary>
					<AddCartItemButton label={t('Add Fee', { _tags: 'core' })} Modal={AddFeeModal} />
				</ErrorBoundary>
			</Box>
			<Box>
				<ErrorBoundary>
					<AddCartItemButton
						label={t('Add Shipping', { _tags: 'core' })}
						Modal={AddShippingModal}
					/>
				</ErrorBoundary>
			</Box>
		</>
	);
};
