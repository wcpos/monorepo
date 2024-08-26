import * as React from 'react';

import { Dialog, DialogContent, DialogTitle } from '@wcpos/components/src/dialog';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { IconButton } from '@wcpos/components/src/icon-button';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipTrigger, TooltipContent } from '@wcpos/components/src/tooltip';

import { CustomerForm, CustomerFormValues, SubmitCustomerHandle } from './form';
import { useT } from '../../../../contexts/translations';
import { useMutation } from '../../hooks/mutations/use-mutation';

interface Props {
	onAdd?: (doc: import('@wcpos/database').CustomerDocument) => void;
}

export const AddNewCustomer = ({ onAdd }: Props) => {
	const t = useT();
	const [open, setOpen] = React.useState(false);
	const addMiscProductRef = React.useRef<SubmitCustomerHandle>(null);
	const { create } = useMutation({ collectionName: 'customers' });

	/**
	 * Close onAdd
	 */
	const handleAddCustomer = React.useCallback(
		async ({ billing, shipping, copyBillingToShipping }: CustomerFormValues) => {
			if (copyBillingToShipping) {
				shipping = {
					first_name: billing.first_name,
					last_name: billing.last_name,
					company: billing.company,
					address_1: billing.address_1,
					address_2: billing.address_2,
					city: billing.city,
					state: billing.state,
					country: billing.country,
					postcode: billing.postcode,
				};
			}
			// setLoading(true);
			try {
				const doc = await create({ billing, shipping });
				if (onAdd) {
					onAdd(doc);
				}
			} finally {
				// setLoading(false);
			}
		},
		[create, onAdd]
	);

	return (
		<ErrorBoundary>
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<IconButton name="userPlus" onPress={() => setOpen(true)} />
				</TooltipTrigger>
				<TooltipContent>
					<Text>{t('Add new customer', { _tags: 'core' })}</Text>
				</TooltipContent>
				<Dialog open={open} onOpenChange={setOpen} title={t('Add new customer', { _tags: 'core' })}>
					<DialogContent>
						<CustomerForm ref={addMiscProductRef} onSubmit={handleAddCustomer} />
					</DialogContent>
				</Dialog>
			</Tooltip>
		</ErrorBoundary>
	);
};
