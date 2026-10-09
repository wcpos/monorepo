import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Checkbox } from '@wcpos/components/checkbox';
import { Input } from '@wcpos/components/input';
import { OptionSelect } from '@wcpos/components/select';
import { Text } from '@wcpos/components/text';
import { type DeclaredFields, type DeclaredValues } from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';

import { isNote, isValueComponent } from './declared-fields';
import { useT } from '../../../../../contexts/translations';

const logger = getLogger(['wcpos', 'pos', 'checkout', 'tender']);

/**
 * The declared UI of contract 1.2 drawn with the app's own controls (roadmap#415 R3): the
 * gateway names components and the app lays them out in declaration order as helpers above
 * the keypad. Nothing here is the gateway's markup — a name this build does not know is
 * skipped and logged, never rendered raw.
 */
const INPUT_TYPES = { text: 'text', email: 'email', tel: 'phone', number: 'numeric' } as const;

interface Props {
	fields: DeclaredFields;
	values: DeclaredValues;
	/** Per-component refusal lines from `wcpos_fields_invalid`; `_form` is the gateway's own. */
	errors: Record<string, string>;
	onChange: (next: DeclaredValues, changedId: string) => void;
	disabled?: boolean;
}

export function DeclaredFieldsView({ fields, values, errors, onChange: emit, disabled }: Props) {
	const t = useT();
	const onChange = (id: string, value: string | boolean) => emit({ ...values, [id]: value }, id);
	// Logging is a side effect: once per declaration, after render, never while rendering.
	const unknown = fields.components
		.filter((component) => !isNote(component) && !isValueComponent(component))
		.map((component) => component.component)
		.join(',');
	React.useEffect(() => {
		if (unknown === '') return;
		logger.warn('Skipped unknown payment field components', { context: { components: unknown } });
	}, [unknown]);
	return (
		<View testID="checkout-fields" className="w-full max-w-md gap-3">
			{fields.components.map((component, index) => {
				if (isNote(component)) {
					return (
						<Text key={`note-${index}`} className="text-muted-foreground text-sm" decodeHtml>
							{component.text}
						</Text>
					);
				}
				if (!isValueComponent(component)) return null;
				const error = errors[component.id];
				const errorLine = error ? (
					<Text
						testID={`checkout-field-${component.id}-error`}
						className="text-destructive text-xs"
					>
						{error}
					</Text>
				) : null;
				if (component.component === 'checkbox') {
					const checked = values[component.id] === true;
					return (
						<View key={component.id} className="gap-1">
							<Pressable
								className="flex-row items-center gap-2"
								disabled={disabled}
								onPress={() => onChange(component.id, !checked)}
							>
								<Checkbox
									testID={`checkout-field-${component.id}`}
									checked={checked}
									disabled={disabled}
									onCheckedChange={(next) => onChange(component.id, next)}
								/>
								<Text className="text-foreground text-sm" decodeHtml>
									{component.label}
								</Text>
							</Pressable>
							{errorLine}
						</View>
					);
				}
				const value = typeof values[component.id] === 'string' ? String(values[component.id]) : '';
				return (
					<View key={component.id} className="gap-1">
						<Text className="text-muted-foreground text-xs" decodeHtml>
							{component.label}
						</Text>
						{component.component === 'select' ? (
							<View testID={`checkout-field-${component.id}`}>
								<OptionSelect
									options={component.options}
									value={value === '' ? undefined : value}
									placeholder={t('pos_checkout.choose_field', { label: component.label })}
									disabled={disabled}
									onChange={(next) => onChange(component.id, next ?? '')}
								/>
							</View>
						) : (
							<Input
								testID={`checkout-field-${component.id}`}
								type={INPUT_TYPES[component.input as keyof typeof INPUT_TYPES] ?? 'text'}
								autoCapitalize="none"
								autoCorrect={false}
								value={value}
								editable={!disabled}
								onChangeText={(next) => onChange(component.id, next)}
							/>
						)}
						{errorLine}
					</View>
				);
			})}
			{errors._form ? (
				<Text testID="checkout-form-error" className="text-destructive text-sm">
					{errors._form}
				</Text>
			) : null}
		</View>
	);
}
