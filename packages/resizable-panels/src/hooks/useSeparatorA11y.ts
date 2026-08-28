import type { PanelGroupModel } from '../model/PanelGroupModel';
import type { Direction } from '../types';

type SeparatorA11yOptions = {
	direction: Direction;
	disabled: boolean;
	handleId: string;
	model: PanelGroupModel;
};

export type SeparatorA11yProps = Record<string, never>;

export function useSeparatorA11y(_options: SeparatorA11yOptions): SeparatorA11yProps {
	return {};
}
