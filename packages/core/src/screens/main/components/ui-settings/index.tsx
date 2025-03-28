import * as React from 'react';

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogBody,
	DialogFooter,
	DialogClose,
	DialogAction,
} from '@wcpos/components/dialog';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipTrigger, TooltipContent } from '@wcpos/components/tooltip';

import { columnsFormSchema, UISettingsColumnsForm } from './columns-form';
import { useT } from '../../../../contexts/translations';

interface DialogContextProps {
	buttonPressHandlerRef: React.MutableRefObject<(() => void) | null>;
}

const DialogContext = React.createContext<DialogContextProps | undefined>(undefined);

const useDialogContext = () => {
	const context = React.useContext(DialogContext);
	if (!context) {
		throw new Error('useDialogContext must be used within a DialogProvider');
	}
	return context;
};

interface Props {
	title: string;
	children: React.ReactNode;
}

/**
 *
 */
const UISettingsDialog = ({ title, children }: Props) => {
	const [openDialog, setOpenDialog] = React.useState(false);
	const t = useT();
	const buttonPressHandlerRef = React.useRef<() => void>(() => {});

	/**
	 *
	 */
	const handleButtonPress = () => {
		if (buttonPressHandlerRef.current) {
			buttonPressHandlerRef.current();
		}
	};

	return (
		<ErrorBoundary>
			<Dialog open={openDialog} onOpenChange={setOpenDialog}>
				<Tooltip>
					<TooltipTrigger asChild onPress={() => setOpenDialog(true)}>
						<IconButton name="sliders" />
					</TooltipTrigger>
					<TooltipContent>
						<Text>{title}</Text>
					</TooltipContent>
				</Tooltip>
				<DialogContent size="lg">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<DialogContext.Provider value={{ buttonPressHandlerRef }}>
							{children}
						</DialogContext.Provider>
					</DialogBody>
					<DialogFooter>
						<DialogClose>{t('Close', { _tags: 'core' })}</DialogClose>
						<DialogAction variant="destructive" onPress={handleButtonPress}>
							{t('Restore Default Settings', { _tags: 'core' })}
						</DialogAction>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</ErrorBoundary>
	);
};

export { UISettingsDialog, columnsFormSchema, UISettingsColumnsForm, useDialogContext };
