import * as React from 'react';
import Box from '../../box';
import Button from '../../button';
import Text from '../../text';
import TextInput from '../../textinput';
import { ADDITIONAL_PROPERTY_FLAG } from '../form.helpers';

const REQUIRED_FIELD_SYMBOL = '*';

const Label = ({ label, required, id }) => {
	if (!label) {
		return null;
	}

	return (
		<Text>
			{label}
			{required && REQUIRED_FIELD_SYMBOL}
		</Text>
	);
};

const LabelInput = ({ id, label, onChange }) => {
	return (
		<TextInput
			type="text"
			id={id}
			onBlur={(event) => onChange(event.target.value)}
			defaultValue={label}
		/>
	);
};

export const Help = ({ id, help }) => {
	if (!help) {
		return null;
	}
	if (typeof help === 'string') {
		return <Text>{help}</Text>;
	}
	return <Text>{String(help)}</Text>;
};

export const ErrorList = ({ errors = [] }) => {
	if (errors.length === 0) {
		return null;
	}

	return (
		<Box>
			{errors
				.filter((elem) => !!elem)
				.map((error, index) => {
					return <Text key={index}>{error}</Text>;
				})}
		</Box>
	);
};

interface WrapIfAdditionalProps {}

const WrapIfAdditional = ({
	label,
	schema,
	children,
	required,
	id,
	onKeyChange,
	disabled,
	readonly,
	onDropPropertyClick,
}: WrapIfAdditionalProps) => {
	const keyLabel = `${label} Key`; // i18n ?
	const additional = schema.hasOwnProperty(ADDITIONAL_PROPERTY_FLAG);

	if (!additional) {
		return children;
	}

	return (
		<Box>
			<Box>
				<Label label={keyLabel} required={required} id={`${id}-key`} />
				<LabelInput label={label} required={required} id={`${id}-key`} onChange={onKeyChange} />
			</Box>
			<Box>{children}</Box>
			<Box>
				<Button
					type="warning"
					icon="remove"
					disabled={disabled || readonly}
					onPress={onDropPropertyClick(label)}
				/>
			</Box>
		</Box>
	);
};

export interface DefaultTemplateProps {}

export const DefaultTemplate = ({
	id,
	label,
	children,
	errors,
	help,
	description,
	hidden,
	required,
	displayLabel,
	...props
}: DefaultTemplateProps) => {
	if (hidden) {
		return <div className="hidden">{children}</div>;
	}

	return (
		<WrapIfAdditional {...props}>
			{displayLabel && <Label label={label} required={required} id={id} />}
			{displayLabel && description ? description : null}
			{children}
			{errors}
			{help}
		</WrapIfAdditional>
	);
};
