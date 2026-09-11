const NATIVE_POPOVER_MAX_HEIGHT = 300;
const NATIVE_POPOVER_VERTICAL_PADDING = 16;
const NATIVE_SEARCH_INPUT_HEIGHT_WITH_MARGIN = 48;
const NATIVE_LIST_MIN_ITEM_HEIGHT = 36;
const NATIVE_LIST_MAX_HEIGHT =
	NATIVE_POPOVER_MAX_HEIGHT -
	NATIVE_POPOVER_VERTICAL_PADDING -
	NATIVE_SEARCH_INPUT_HEIGHT_WITH_MARGIN;

// A phone bottom sheet takes at most this fraction of the viewport; the list inside it
// gets what is left after the search input, sheet padding and the bottom safe-area inset,
// capped so a tall phone does not turn the sheet into a full-screen list.
const PHONE_SHEET_VIEWPORT_FRACTION = 0.7;
const PHONE_SHEET_LIST_MAX_HEIGHT = 420;

function getPhoneSheetMaxHeight(viewportHeight: number) {
	return Math.round(viewportHeight * PHONE_SHEET_VIEWPORT_FRACTION);
}

function getPhoneSheetListMaxHeight(viewportHeight: number, bottomInset: number) {
	const available =
		getPhoneSheetMaxHeight(viewportHeight) -
		NATIVE_POPOVER_VERTICAL_PADDING -
		NATIVE_SEARCH_INPUT_HEIGHT_WITH_MARGIN -
		bottomInset;
	return Math.max(NATIVE_LIST_MIN_ITEM_HEIGHT, Math.min(PHONE_SHEET_LIST_MAX_HEIGHT, available));
}

function getNativeListHeight(
	itemCount: number,
	estimatedItemSize: number,
	maxHeight = NATIVE_LIST_MAX_HEIGHT
) {
	const itemHeight = Math.max(estimatedItemSize, NATIVE_LIST_MIN_ITEM_HEIGHT);
	return Math.min(itemCount * itemHeight, maxHeight);
}

export {
	getPhoneSheetListMaxHeight,
	getPhoneSheetMaxHeight,
	PHONE_SHEET_LIST_MAX_HEIGHT,
	NATIVE_LIST_MAX_HEIGHT,
	NATIVE_LIST_MIN_ITEM_HEIGHT,
	NATIVE_POPOVER_MAX_HEIGHT,
	NATIVE_POPOVER_VERTICAL_PADDING,
	NATIVE_SEARCH_INPUT_HEIGHT_WITH_MARGIN,
	getNativeListHeight,
};
