import * as React from 'react';
import { Pressable, ScrollView } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';

interface FieldGroup {
	key: string;
	label: string;
	fields: { key: string; label: string; placeholder: string }[];
}

/**
 * Canonical receipt_data field definitions grouped by section.
 * These match the Receipt_Data_Schema from PR #548.
 */
function useFieldGroups(): FieldGroup[] {
	const t = useT();

	return React.useMemo(
		() => [
			{
				key: 'meta',
				label: t('receipt.fields_meta', 'Meta'),
				fields: [
					{
						key: 'order_number',
						label: t('common.order_number'),
						placeholder: '{{ meta.order_number }}',
					},
					{
						key: 'order_date',
						label: t('common.date'),
						placeholder: '{{ meta.order_date }}',
					},
					{
						key: 'currency',
						label: t('common.currency'),
						placeholder: '{{ meta.currency }}',
					},
					{
						key: 'status',
						label: t('common.status'),
						placeholder: '{{ meta.status }}',
					},
				],
			},
			{
				key: 'store',
				label: t('receipt.fields_store', 'Store'),
				fields: [
					{
						key: 'name',
						label: t('settings.store_name'),
						placeholder: '{{ store.name }}',
					},
					{
						key: 'address',
						label: t('common.address'),
						placeholder: '{{ store.address }}',
					},
					{
						key: 'phone',
						label: t('common.phone'),
						placeholder: '{{ store.phone }}',
					},
					{
						key: 'email',
						label: t('common.email'),
						placeholder: '{{ store.email }}',
					},
				],
			},
			{
				key: 'customer',
				label: t('common.customer'),
				fields: [
					{
						key: 'name',
						label: t('common.name'),
						placeholder: '{{ customer.name }}',
					},
					{
						key: 'email',
						label: t('common.email'),
						placeholder: '{{ customer.email }}',
					},
					{
						key: 'phone',
						label: t('common.phone'),
						placeholder: '{{ customer.phone }}',
					},
					{
						key: 'billing_address',
						label: t('common.billing_address'),
						placeholder: '{{ customer.billing_address }}',
					},
					{
						key: 'shipping_address',
						label: t('common.shipping_address'),
						placeholder: '{{ customer.shipping_address }}',
					},
				],
			},
			{
				key: 'lines',
				label: t('receipt.fields_lines', 'Line Items'),
				fields: [
					{
						key: 'name',
						label: t('common.name'),
						placeholder: '{{ line.name }}',
					},
					{
						key: 'quantity',
						label: t('common.quantity'),
						placeholder: '{{ line.quantity }}',
					},
					{
						key: 'price',
						label: t('common.price'),
						placeholder: '{{ line.price }}',
					},
					{
						key: 'total',
						label: t('common.total'),
						placeholder: '{{ line.total }}',
					},
					{
						key: 'sku',
						label: t('common.sku'),
						placeholder: '{{ line.sku }}',
					},
				],
			},
			{
				key: 'totals',
				label: t('receipt.fields_totals', 'Totals'),
				fields: [
					{
						key: 'subtotal',
						label: t('common.subtotal'),
						placeholder: '{{ totals.subtotal }}',
					},
					{
						key: 'tax_total',
						label: t('common.tax'),
						placeholder: '{{ totals.tax_total }}',
					},
					{
						key: 'discount_total',
						label: t('common.discount'),
						placeholder: '{{ totals.discount_total }}',
					},
					{
						key: 'grand_total_incl',
						label: t('common.total'),
						placeholder: '{{ totals.grand_total_incl }}',
					},
				],
			},
			{
				key: 'payments',
				label: t('receipt.fields_payments', 'Payments'),
				fields: [
					{
						key: 'method',
						label: t('common.payment_method'),
						placeholder: '{{ payment.method }}',
					},
					{
						key: 'amount',
						label: t('common.amount'),
						placeholder: '{{ payment.amount }}',
					},
					{
						key: 'transaction_id',
						label: t('common.transaction_id', 'Transaction ID'),
						placeholder: '{{ payment.transaction_id }}',
					},
				],
			},
			{
				key: 'fiscal',
				label: t('receipt.fields_fiscal', 'Fiscal'),
				fields: [
					{
						key: 'submission_status',
						label: t('receipt.fiscal_status', 'Status'),
						placeholder: '{{ fiscal.submission_status }}',
					},
					{
						key: 'fiscal_id',
						label: t('receipt.fiscal_id', 'Fiscal ID'),
						placeholder: '{{ fiscal.fiscal_id }}',
					},
				],
			},
		],
		[t]
	);
}

interface FieldPickerProps {
	onInsert: (placeholder: string) => void;
}

/**
 * Sidebar listing canonical receipt_data fields, grouped by section.
 * Clicking a field inserts the corresponding {{ placeholder }} into the editor.
 */
export function FieldPicker({ onInsert }: FieldPickerProps) {
	const groups = useFieldGroups();
	const [expandedGroup, setExpandedGroup] = React.useState<string | null>('meta');

	return (
		<ScrollView className="border-border max-h-96 rounded-md border">
			<VStack className="p-2">
				{groups.map((group) => (
					<VStack key={group.key}>
						<Pressable
							onPress={() => setExpandedGroup(expandedGroup === group.key ? null : group.key)}
						>
							<HStack className="items-center gap-1 py-1.5">
								<Icon
									name={expandedGroup === group.key ? 'chevronDown' : 'chevronRight'}
									size="xs"
									variant="muted"
								/>
								<Text className="text-sm font-medium">{group.label}</Text>
							</HStack>
						</Pressable>
						{expandedGroup === group.key &&
							group.fields.map((field) => (
								<Pressable
									key={field.key}
									onPress={() => onInsert(field.placeholder)}
									className="hover:bg-accent ml-4 rounded px-2 py-1"
								>
									<VStack>
										<Text className="text-sm">{field.label}</Text>
										<Text className="text-muted-foreground text-xs">{field.placeholder}</Text>
									</VStack>
								</Pressable>
							))}
					</VStack>
				))}
			</VStack>
		</ScrollView>
	);
}
