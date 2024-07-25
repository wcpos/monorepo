export interface Column {
	key: string;
	label?: string;
	width?: number;
	flex?: number;
	align?: 'left' | 'center' | 'right';
	cellRenderer?: ({ item, column }: { item: any; column: any }) => React.ReactNode;
}
