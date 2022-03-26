import * as React from 'react';
import Box from '../../box';
import {
	retrieveSchema,
	guessType,
	getDefaultFormState,
	getUiOptions,
	getWidget,
} from '../form.helpers';

export const MultiSchemaField = ({
	disabled = false,
	readonly = false,
	hideError = false,
	errorSchema = {},
	idSchema = {},
	uiSchema = {},
	registry,
	formData,
	onChange,
	options,
	baseType,
	idPrefix,
	idSeparator,
	onBlur,
	onFocus,
	schema,
}) => {
	const [selectedOption, setSelectedOption] = React.useState(0);

	// componentDidUpdate(prevProps, prevState) {
	//   if (
	//     !deepEquals(this.props.formData, prevProps.formData) &&
	//     this.props.idSchema.$id === prevProps.idSchema.$id
	//   ) {
	//     const matchingOption = this.getMatchingOption(
	//       this.props.formData,
	//       this.props.options
	//     );

	//     if (!prevState || matchingOption === this.state.selectedOption) {
	//       return;
	//     }

	//     this.setState({
	//       selectedOption: matchingOption,
	//     });
	//   }
	// }

	// const getMatchingOption = (formData, options) => {
	//   const { rootSchema } = registry;

	//   let option = getMatchingOption(formData, options, rootSchema);
	//   if (option !== 0) {
	//     return option;
	//   }
	//   // If the form data matches none of the options, use the currently selected
	//   // option, assuming it's available; otherwise use the first option
	//   return this && this.state ? this.state.selectedOption : 0;
	// }

	const onOptionChange = (option) => {
		const selectedOption = parseInt(option, 10);
		const { rootSchema } = registry;
		const newOption = retrieveSchema(options[selectedOption], rootSchema, formData);

		// If the new option is of type object and the current data is an object,
		// discard properties added using the old option.
		let newFormData;
		if (guessType(formData) === 'object' && (newOption.type === 'object' || newOption.properties)) {
			newFormData = { ...formData };

			const optionsToDiscard = options.slice();
			optionsToDiscard.splice(selectedOption, 1);

			// Discard any data added using other options
			for (const option of optionsToDiscard) {
				if (option.properties) {
					for (const key in option.properties) {
						if (newFormData.hasOwnProperty(key)) {
							delete newFormData[key];
						}
					}
				}
			}
		}
		// Call getDefaultFormState to make sure defaults are populated on change.
		onChange(getDefaultFormState(options[selectedOption], newFormData, rootSchema));

		setSelectedOption(parseInt(option, 10));
	};

	const { SchemaField } = registry.fields;
	const { widgets } = registry;
	const { widget = 'select', ...uiOptions } = getUiOptions(uiSchema);
	const Widget = getWidget({ type: 'number' }, widget, widgets);

	const option = options[selectedOption] || null;
	let optionSchema;

	if (option) {
		// If the subschema doesn't declare a type, infer the type from the
		// parent schema
		optionSchema = option.type ? option : { ...option, type: baseType };
	}

	const enumOptions = options.map((option, index) => ({
		label: option.title || `Option ${index + 1}`,
		value: index,
	}));

	return (
		<Box>
			<Box>
				<Widget
					id={`${idSchema.$id}${schema.oneOf ? '__oneof_select' : '__anyof_select'}`}
					schema={{ type: 'number', default: 0 }}
					onChange={onOptionChange}
					onBlur={onBlur}
					onFocus={onFocus}
					value={selectedOption}
					options={{ enumOptions }}
					{...uiOptions}
				/>
			</Box>

			{option !== null && (
				<SchemaField
					schema={optionSchema}
					uiSchema={uiSchema}
					errorSchema={errorSchema}
					idSchema={idSchema}
					idPrefix={idPrefix}
					idSeparator={idSeparator}
					formData={formData}
					onChange={onChange}
					onBlur={onBlur}
					onFocus={onFocus}
					registry={registry}
					disabled={disabled}
					readonly={readonly}
					hideError={hideError}
				/>
			)}
		</Box>
	);
};
