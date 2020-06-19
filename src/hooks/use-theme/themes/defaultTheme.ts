import Platform from '../../../utils/platform';
import palette from '../palettes/blue-grey.json';
import normalizeText from '../normalize-text';

const colors = {
	background: palette['blue-grey-050'],
	border: palette['blue-grey-600'],
	primary: palette['blue-grey-700'],
	secondary: palette['blue-grey-500'],
	attention: palette['cyan-800'],
	critical: palette['red-vivid-600'],
	info: palette['light-blue-vivid-800'],
	success: palette['teal-800'],
	warning: palette['yellow-vivid-800'],
	inverse: 'rgba(256, 256, 256, 0.8)',
	disabled: palette['blue-grey-400'],
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

const theme = {
	APP_BACKGROUND_COLOR: colors.background,

	BUTTON_BORDER_RADIUS: '3px',
	BUTTON_COLOR: colors.primary,
	BUTTON_COLOR_SECONDARY: colors.secondary,
	BUTTON_COLOR_ATTENTION: colors.attention,
	BUTTON_COLOR_CRITICAL: colors.critical,
	BUTTON_COLOR_INFO: colors.info,
	BUTTON_COLOR_SUCCESS: colors.success,
	BUTTON_COLOR_WARNING: colors.warning,
	BUTTON_COLOR_INVERSE: colors.inverse,
	BUTTON_COLOR_DISABLED: colors.disabled,
	BUTTON_PADDING_X: '10px',
	BUTTON_PADDING_Y: '5px',

	BUTTONGROUP_BORDER_COLOR: colors.border,
	BUTTONGROUP_TEXT_COLOR: colors.background,

	CHECKBOX_BACKGROUND_COLOR: colors.primary,
	CHECKBOX_BACKGROUND_COLOR_DISABLED: colors.disabled,
	CHECKBOX_BORDER_COLOR: colors.primary,
	CHECKBOX_BORDER_RADIUS: '3px',
	CHECKBOX_BORDER_WIDTH: '1px',
	CHECKBOX_INFO_COLOR: colors.secondary,
	CHECKBOX_INFO_FONT_SIZE: `${normalizeText(12)}px`,
	CHECKBOX_LABEL_COLOR: colors.primary,
	CHECKBOX_LABEL_FONT_SIZE: `${normalizeText(14)}px`,
	CHECKBOX_WIDTH: `${normalizeText(14)}px`,
	CHECKBOX_HEIGHT: `${normalizeText(14)}px`,

	FONT_FAMILY: fonts.regular,

	FONT_SIZE: `${normalizeText(14)}px`,
	FONT_SIZE_LARGE: `${normalizeText(18)}px`,
	FONT_SIZE_SMALL: `${normalizeText(12)}px`,

	FONT_WEIGHT: 400,
	FONT_WEIGHT_BOLD: 700,
	FONT_WEIGHT_LIGHT: 300,

	INPUT_BACKGROUND_COLOR: '#FFFFFF',
	INPUT_BORDER_COLOR: colors.primary,
	INPUT_BORDER_RADIUS: '3px',
	INPUT_BORDER_WIDTH: '1px',
	INPUT_ERROR_TEXT_COLOR: colors.primary,
	INPUT_PADDING: '5px',
	INPUT_FONT_SIZE: `${normalizeText(14)}px`,
	INPUT_TEXT_COLOR: colors.border,

	MASTERBAR_BACKGROUND_COLOR: colors.primary,
	MASTERBAR_TITLE_COLOR: '#FFFFFF',
	MASTERBAR_TITLE_SIZE: '18px',

	LIST_ITEM_PADDING: '10px',

	LOADER_COLOR: colors.primary,

	PAGE_BACKGROUND_COLOR: colors.background,
	PAGE_HEADER_BACKGROUND_COLOR: 'red',
	PAGE_HEADER_PADDING_X: '5px',
	PAGE_HEADER_PADDING_Y: '5px',
	PAGE_MAIN_BACKGROUND_COLOR: 'yellow',
	PAGE_MAIN_PADDING_X: '5px',
	PAGE_MAIN_PADDING_Y: '5px',

	SEGMENT_BACKGROUND_COLOR: '#FFFFFF',
	SEGMENT_BORDER_COLOR: colors.primary,
	SEGMENT_BORDER_RADIUS: '3px',
	SEGMENT_BORDER_WIDTH: '1px',
	SEGMENT_PADDING: '5px',

	SEGMENT_GROUP_PADDING: '10px',
	SEGMENT_MARGIN_BOTTOM: '10px',

	SIDEBAR_BACKGROUND_COLOR: '#FFFFFF',

	TAG_BACKGROUND_COLOR: colors.secondary,
	TAG_BACKGROUND_DISABLED: colors.disabled,
	TAG_TEXT_COLOR: colors.inverse,
	TAG_BORDER_RADIUS: '10px',
	TAG_PADDING_X: '5px',
	TAG_PADDING_Y: '5px',

	TEXT_COLOR: colors.primary,
	TEXT_COLOR_SECONDARY: colors.secondary,
	TEXT_COLOR_ATTENTION: colors.attention,
	TEXT_COLOR_CRITICAL: colors.critical,
	TEXT_COLOR_INFO: colors.info,
	TEXT_COLOR_SUCCESS: colors.success,
	TEXT_COLOR_WARNING: colors.warning,
	TEXT_COLOR_INVERSE: colors.inverse,

	TOAST_BACKGROUND_COLOR: '#000000',
	TOAST_Z_INDEX: 1001,
	TOAST_BORDER_RADIUS: '3px',
	TOAST_PADDING_X: '10px',
	TOAST_PADDING_Y: '5px',
	TOAST_TEXT_COLOR: '#FFFFFF',
};

export default theme;
