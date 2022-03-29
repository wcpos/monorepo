import Checkbox from '../checkbox';
import Radio from '../radio';
import Select from '../select';
import Slider from '../slider';
import Switch from '../switch';
import TextArea from '../textarea';
import TextInput from '../textinput';

export default {
	Checkbox,
	Radio,
	Select,
	Slider,
	Switch,
	TextArea,
	TextInput,
};

/**
 *
 */
export const widgetMap = {
	boolean: {
		checkbox: 'Checkbox',
		radio: 'Radio',
		select: 'Select',
		switch: 'Switch',
		hidden: 'HiddenWidget',
	},
	string: {
		text: 'TextInput',
		password: 'PasswordWidget',
		email: 'EmailWidget',
		hostname: 'TextInput',
		ipv4: 'TextInput',
		ipv6: 'TextInput',
		uri: 'URLWidget',
		'data-url': 'FileWidget',
		radio: 'RadioWidget',
		select: 'Select',
		textarea: 'TextArea',
		hidden: 'HiddenWidget',
		date: 'DateWidget',
		datetime: 'DateTimeWidget',
		'date-time': 'DateTimeWidget',
		'alt-date': 'AltDateWidget',
		'alt-datetime': 'AltDateTimeWidget',
		color: 'ColorWidget',
		file: 'FileWidget',
	},
	number: {
		text: 'TextInput',
		select: 'Select',
		updown: 'UpDownWidget',
		range: 'Slider',
		radio: 'Radio',
		hidden: 'HiddenWidget',
	},
	integer: {
		text: 'TextInput',
		select: 'Select',
		updown: 'UpDownWidget',
		range: 'Slider',
		radio: 'Radio',
		hidden: 'HiddenWidget',
	},
	array: {
		select: 'Select',
		checkboxes: 'CheckboxesWidget',
		files: 'FileWidget',
		hidden: 'HiddenWidget',
	},
};
