import * as React from 'react';

import { ModalClose, ModalFooter } from '@wcpos/components/src/modal';
import {
	Table,
	TableHeader,
	TableHead,
	TableRow,
	TableCell,
	TableBody,
} from '@wcpos/components/src/table';
import { Text } from '@wcpos/components/src/text';

import { useT } from '../../../contexts/translations';

export const KeyboardShortcuts = () => {
	const t = useT();

	const shortcuts = [
		{ key: 'ctrl + shift + s', description: t('Settings') },
		{ key: 'ctrl + shift + a', description: t('POS') },
		{ key: 'ctrl + shift + p', description: t('Products') },
		{ key: 'ctrl + shift + o', description: t('Orders') },
		{ key: 'ctrl + shift + c', description: t('Customers') },
		{ key: 'ctrl + shift + ?', description: t('Support') },
		{ key: 'ctrl + shift + l', description: t('Logout') },
	];

	return (
		<>
			<Table aria-labelledby="keyboard-shortcuts">
				<TableHeader>
					<TableRow>
						<TableHead>
							<Text>{t('Key Combination')}</Text>
						</TableHead>
						<TableHead>
							<Text>{t('Description')}</Text>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{shortcuts.map((shortcut) => (
						<TableRow key={shortcut.key}>
							<TableCell>
								<Text className="p-2 border border-border rounded bg-muted font-mono text-sm">
									{shortcut.key}
								</Text>
							</TableCell>
							<TableCell>
								<Text>{shortcut.description}</Text>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<ModalFooter className="px-0">
				<ModalClose>{t('Close')}</ModalClose>
			</ModalFooter>
		</>
	);
};
