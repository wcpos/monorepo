import Platform from '../../platform';
import palette from '../palettes/blue-grey.json';
import { ThemeProps } from '../types';
import normalizeText from '../normalize-text';

const colors = {
	background: palette['blue-grey-050'],
	border: palette['blue-grey-600'],
	disabled: palette['blue-grey-400'],
	error: palette['blue-grey-600'],
	primary: palette['blue-grey-700'],
	secondary: palette['blue-grey-500'],
	text: palette['blue-grey-600'],
};

const fonts = Platform.select({
	android: {
		regular: 'sans-serif',
	},
	ios: {
		regular: 'System',
	},
	default: {
		regular: 'sans-serif',
	},
});

const theme: ThemeProps = {
	BUTTON_TEXT_COLOR: colors.background,
	BUTTON_BACKGROUND_COLOR: colors.primary,
	BUTTON_BACKGROUND_COLOR_DISABLED: colors.disabled,
	BUTTONGROUP_BORDER_COLOR: colors.border,
	BUTTONGROUP_TEXT_COLOR: colors.background,

	CHECKBOX_BACKGROUND_COLOR: colors.primary,
	CHECKBOX_BACKGROUND_COLOR_DISABLED: colors.disabled,
	CHECKBOX_BORDER_COLOR: colors.primary,
	CHECKBOX_BORDER_RADIUS: '3px',
	CHECKBOX_BORDER_WIDTH: '1px',
	CHECKBOX_INFO_COLOR: colors.secondary,
	CHECKBOX_INFO_FONT_SIZE: normalizeText(14),
	CHECKBOX_LABEL_COLOR: colors.primary,
	CHECKBOX_LABEL_FONT_SIZE: normalizeText(18),

	FONT_FAMILY: fonts.regular,

	FONT_SIZE: normalizeText(18),
	FONT_SIZE_LARGE: normalizeText(32),
	FONT_SIZE_SMALL: normalizeText(14),

	FONT_WEIGHT: 400,
	FONT_WEIGHT_BOLD: 700,
	FONT_WEIGHT_LIGHT: 300,

	INPUT_BACKGROUND_COLOR: '#FFFFFF',
	INPUT_BORDER_COLOR: colors.primary,
	INPUT_BORDER_RADIUS: '3px',
	INPUT_BORDER_WIDTH: '1px',
	INPUT_ERROR_TEXT_COLOR: colors.primary,
	INPUT_PADDING: '5px',
	INPUT_FONT_SIZE: normalizeText(18),
	INPUT_TEXT_COLOR: colors.border,

	MASTERBAR_BACKGROUND_COLOR: colors.primary,
	MASTERBAR_TITLE_COLOR: '#FFFFFF',
	MASTERBAR_TITLE_SIZE: '18px',

	LOADER_COLOR: colors.primary,

	SEGMENT_BACKGROUND_COLOR: '#FFFFFF',
	SEGMENT_BORDER_COLOR: colors.primary,
	SEGMENT_BORDER_RADIUS: '3px',
	SEGMENT_BORDER_WIDTH: '1px',
	SEGMENT_PADDING: '0px',

	SEGMENT_GROUP_PADDING: '10px',

	SIDEBAR_BACKGROUND_COLOR: '#FFFFFF',

	TEXT_COLOR: colors.primary,
	TEXT_COLOR_SECONDARY: colors.secondary,
};

export default theme;
