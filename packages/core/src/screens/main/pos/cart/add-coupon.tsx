import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogAction, DialogClose, DialogFooter, useRootContext } from '@wcpos/components/dialog';
import { Form, FormField, FormInput } from '@wcpos/components/form';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import { FormErrors } from '../../components/form-errors';
import { useAddCoupon } from '../hooks/use-add-coupon';

/**
 *
 */
const formSchema = z.object({
	code: z.string().min(1, 'Coupon code is required'),
});

type FormValues = z.infer<typeof formSchema>;

/**
 *
 */
export function AddCoupon() {
	const t = useT();
	const { addCoupon } = useAddCoupon();
	const { onOpenChange } = useRootContext();
	const [error, setError] = React.useState<string | null>(null);

	/**
	 *
	 */
	const form = useForm<FormValues, unknown, FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		defaultValues: {
			code: '',
		},
	});

	/**
	 *
	 */
	const handleAdd = React.useCallback(
		async (data: FormValues) => {
			setError(null);
			const result = await addCoupon(data.code);
			if (result.success) {
				onOpenChange(false);
			} else {
				setError(result.error || 'Failed to apply coupon.');
			}
		},
		[addCoupon, onOpenChange]
	);

	/**
	 * Form submission handler that includes validation
	 */
	const onAdd = form.handleSubmit(handleAdd);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				{error && <Text className="text-destructive">{error}</Text>}
				<FormField
					control={form.control}
					name="code"
					render={({ field }) => (
						<FormInput
							label={t('pos_cart.coupon_code', { defaultValue: 'Coupon Code' })}
							placeholder={t('pos_cart.enter_coupon_code', { defaultValue: 'Enter coupon code' })}
							autoCapitalize="none"
							autoCorrect={false}
							{...field}
						/>
					)}
				/>
				<DialogFooter className="px-0">
					<DialogClose>{t('common.cancel')}</DialogClose>
					<DialogAction testID="add-coupon-submit" onPress={onAdd}>
						{t('common.apply', { defaultValue: 'Apply' })}
					</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
}
