import * as React from 'react';

import { Column } from '@tanstack/react-table';

import { Text } from '@wcpos/tailwind/src/text';

interface Props {
	title: string;
	column: Column<any>;
}

export const Header = ({ title, column }: Props) => {
	return <Text className={'font-medium text-muted-foreground'}>{title}</Text>;
};
