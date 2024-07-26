import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
import { useObservableEagerState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	Form,
	FormField,
	FormInput,
	FormSwitch,
	FormRadioGroup,
	FormSelect,
} from '@wcpos/tailwind/src/form';
import { Label } from '@wcpos/tailwind/src/label';
import { cn } from '@wcpos/tailwind/src/lib/utils';
import { RadioGroupItem } from '@wcpos/tailwind/src/radio-group';
import {
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/tailwind/src/select';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { AmountWidget } from '../../components/amount-widget';
import { TaxClassSelect } from '../../components/tax-class-select';
import { useCurrentOrder } from '../contexts/current-order';
import { useAddFee } from '../hooks/use-add-fee';

const emails = [
	{ value: 'tom@cruise.com', label: 'tom@cruise.com' },
	{ value: 'napoleon@dynamite.com', label: 'napoleon@dynamite.com' },
	{ value: 'kunfu@panda.com', label: 'kunfu@panda.com' },
	{ value: 'bruce@lee.com', label: 'bruce@lee.com' },
	{ value: 'harry@potter.com', label: 'harry@potter.com' },
	{ value: 'jane@doe.com', label: 'jane@doe.com' },
	{ value: 'elon@musk.com', label: 'elon@musk.com' },
	{ value: 'lara@croft.com', label: 'lara@croft.com' },
];

/**
 *
 */
export const AddFee = () => {
	const t = useT();
	const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);

	/**
	 *
	 */
	const formSchema = React.useMemo(
		() =>
			z.object({
				name: z.string().optional(),
				amount: z.number().optional(),
				prices_include_tax: z.boolean().optional(),
				tax_status: z.string().optional(),
				tax_class: z.string().optional(),
			}),
		[]
	);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: '',
			amount: 0,
			prices_include_tax: true,
			tax_status: 'taxable',
			tax_class: '',
		},
	});

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack>
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormInput
							label={t('Fee Name', { _tags: 'core' })}
							placeholder={t('Fee', { _tags: 'core' })}
							{...field}
						/>
					)}
				/>
				<FormField
					control={form.control}
					name="amount"
					render={({ field }) => <AmountWidget label={t('Amount', { _tags: 'core' })} {...field} />}
				/>
				<FormField
					control={form.control}
					name="prices_include_tax"
					render={({ field }) => (
						<FormSwitch
							label={t('Amount Includes Tax', { _tags: 'core' })}
							description="Description"
							{...field}
						/>
					)}
				/>
				<FormField
					control={form.control}
					name="tax_status"
					defaultValue="staff"
					render={({ field }) => {
						function onLabelPress(label: 'taxable' | 'none') {
							return () => {
								form.setValue('tax_status', label);
							};
						}
						return (
							<FormRadioGroup
								label={t('Tax Status', { _tags: 'core' })}
								className="gap-4"
								{...field}
							>
								{(['taxable', 'none'] as const).map((value) => {
									return (
										<View key={value} className={'flex-row gap-2 items-center'}>
											<RadioGroupItem aria-labelledby={`label-for-${value}`} value={value} />
											<Label
												nativeID={`label-for-${value}`}
												className="capitalize"
												onPress={onLabelPress(value)}
											>
												{value}
											</Label>
										</View>
									);
								})}
							</FormRadioGroup>
						);
					}}
				/>
				<FormField
					control={form.control}
					name="tax_class"
					render={({ field }) => (
						<FormSelect label={t('Tax Class', { _tags: 'core' })} {...field}>
							<SelectTrigger
								onLayout={(ev) => {
									setSelectTriggerWidth(ev.nativeEvent.layout.width);
								}}
							>
								<SelectValue
									className={cn(
										'text-sm native:text-lg',
										field.value ? 'text-foreground' : 'text-muted-foreground'
									)}
									placeholder="Select a verified email"
								/>
							</SelectTrigger>
							<SelectContent className="z-[100]" style={{ width: selectTriggerWidth }}>
								<SelectGroup>
									{emails.map((email) => (
										<SelectItem key={email.value} label={email.label} value={email.value}>
											<Text>{email.label}</Text>
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</FormSelect>
					)}
				/>
			</VStack>
		</Form>
	);
};
