/**
 * The widget's size inside the frame: the frame's own size less its `p-4` on each side. The
 * inset is the page gutter (CODING_STANDARDS § Design, Gutters), 4 units of the spacing step
 * (14 Compact, 16 Regular, 20 Spacious), so the caller passes the live gutter in px.
 */
export function adjustForPadding(width: number, height: number, gutter: number) {
	const paddingHorizontal = gutter * 2;
	const paddingVertical = gutter * 2;
	return {
		width: Math.max(0, width - paddingHorizontal),
		height: Math.max(0, height - paddingVertical),
	};
}
