export type Direction = 'horizontal' | 'vertical';
export type GroupResizeBehavior = 'preserve-relative-size' | 'preserve-pixel-size';
export type PanelGroupOnLayoutChanged = (
	layout: number[],
	meta: { isUserInteraction: boolean }
) => void;
