import * as React from 'react';

import { ModalClose, ModalFooter } from '@wcpos/components/modal';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';

export const KeyboardShortcuts = () => {
	const t = useT();

	const shortcuts = [
		{ key: 'ctrl + shift + s', description: t('common.settings') },
		{ key: 'ctrl + shift + a', description: t('common.pos') },
		{ key: 'ctrl + shift + p', description: t('common.products') },
		{ key: 'ctrl + shift + o', description: t('common.orders') },
		{ key: 'ctrl + shift + c', description: t('common.customers') },
		{ key: 'ctrl + shift + ?', description: t('common.support') },
		{ key: 'ctrl + shift + l', description: t('common.logout') },
	];

	return (
		<>
			<Table aria-labelledby="keyboard-shortcuts">
				<TableHeader>
					<TableRow>
						<TableHead>
							<Text>{t('settings.key_combination')}</Text>
						</TableHead>
						<TableHead>
							<Text>{t('settings.description')}</Text>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{shortcuts.map((shortcut) => (
						<TableRow key={shortcut.key}>
							<TableCell>
								<Text className="border-border bg-muted rounded border p-2 font-mono text-sm">
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
				<ModalClose>{t('common.close')}</ModalClose>
			</ModalFooter>
		</>
	);
};
