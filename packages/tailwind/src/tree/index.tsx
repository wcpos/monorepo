import React from 'react';
import type { ReactNode } from 'react';

import { JSONTree } from 'react-json-tree';

import type { StylingValue, Theme } from 'react-base16-styling';

interface CommonExternalProps {
	shouldExpandNodeInitially?: (
		keyPath: readonly (string | number)[],
		data: unknown,
		level: number
	) => boolean;
	labelRenderer?: (keyPath: readonly (string | number)[]) => ReactNode;
	valueRenderer?: (
		displayValue: unknown,
		rawValue: unknown,
		keyPath: readonly (string | number)[]
	) => ReactNode;
	shouldExpandNode?: (
		keyPath: readonly (string | number)[],
		data: unknown,
		level: number
	) => boolean;
	hideRoot?: boolean;
	getItemString?: (type: string, data: unknown, itemType: string, itemString: string) => ReactNode;
	postprocessValue?: (value: unknown) => unknown;
	isCustomNode?: (value: unknown) => boolean;
	collectionLimit?: number;
	sortObjectKeys?: (a: string, b: string) => number | boolean;
}

interface JSONTreeProps extends Partial<CommonExternalProps> {
	data: unknown;
	theme?: Theme;
	invertTheme?: boolean;
}

const theme = {
	scheme: 'github',
	author: 'github (https://github.com)',
	base00: '#ffffff', // Background
	base01: '#f5f5f5', // Lighter background
	base02: '#dcdcdc', // Light border
	base03: '#c0c0c0', // Placeholder text
	base04: '#909090', // Inactive text
	base05: '#333333', // Main text
	base06: '#262626', // Dark text
	base07: '#1a1a1a', // Darker text
	base08: '#ff3333', // Red (errors, important)
	base09: '#ff9900', // Orange (warnings)
	base0A: '#ffcc00', // Yellow (highlights)
	base0B: '#66cc66', // Green (success)
	base0C: '#66cccc', // Cyan (info)
	base0D: '#6699cc', // Blue (links)
	base0E: '#cc66cc', // Purple (keywords)
	base0F: '#cc0000', // Dark red (strong emphasis)
};

const ThemedJSONTree = (props: JSONTreeProps) => {
	return <JSONTree {...props} theme={theme} invertTheme={false} />;
};

export { ThemedJSONTree as Tree };
