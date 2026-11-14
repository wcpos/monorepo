import { set as hugeicons } from './components/hugeicons';
import { set as phosphor } from './components/phosphor';
import { set as tabler } from './components/tabler';

import type { IconSet } from './names';

export const ICON_SETS = {
	tabler,
	hugeicons,
	phosphor,
} as const satisfies Record<string, IconSet>;
export type IconSetId = keyof typeof ICON_SETS;
export const ICON_SET_IDS = Object.keys(ICON_SETS) as IconSetId[];
export const DEFAULT_ICON_SET: IconSetId = 'tabler';
export const ICON_SETTING_AUTO = 'auto';
