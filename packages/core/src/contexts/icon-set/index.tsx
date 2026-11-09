import { ICON_SET_IDS, type IconSetId } from '@wcpos/components/icon';
import { iconSetForTheme } from '@wcpos/components/lib/themes';

/** An explicit family wins; auto, absent and retired values follow the theme (decision 45). */
export function resolveIconSet(value: unknown, theme: string | undefined): IconSetId {
	return ICON_SET_IDS.includes(value as IconSetId) ? (value as IconSetId) : iconSetForTheme(theme);
}
