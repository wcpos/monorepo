import type { PanelSize } from '../Panel';

export type ParsedPanelSize = {
	unit: 'percent' | 'pixels';
	value: number;
};

export function parseSize(size: PanelSize): ParsedPanelSize {
	if (typeof size === 'number') {
		return { unit: 'percent', value: size };
	}

	const normalized = size.trim();
	const match = /^(-?(?:\d+(?:\.\d*)?|\.\d+))(px|%)?$/.exec(normalized);
	if (!match) {
		throw new Error(
			`Invalid panel size "${size}". Use a percentage number, a "%" string, or a "px" string.`
		);
	}

	return {
		unit: match[2] === 'px' ? 'pixels' : 'percent',
		value: Number(match[1]),
	};
}
