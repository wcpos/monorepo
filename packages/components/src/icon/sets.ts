import { set as fontawesome } from './components/fontawesome';
import { set as hugeicons } from './components/hugeicons';
import { set as iconoir } from './components/iconoir';
import { set as lucide } from './components/lucide';
import { set as phosphor } from './components/phosphor';
import { set as solar } from './components/solar';
import { set as tabler } from './components/tabler';
import { set as tabler2 } from './components/tabler-2';

import type { IconSet } from './names';

export const ICON_SETS = {
	fontawesome,
	tabler,
	'tabler-2': tabler2,
	hugeicons,
	lucide,
	phosphor,
	iconoir,
	solar,
} as const satisfies Record<string, IconSet>;
export type IconSetId = keyof typeof ICON_SETS;
export const ICON_SET_IDS = Object.keys(ICON_SETS) as IconSetId[];
export const DEFAULT_ICON_SET: IconSetId = 'tabler';
