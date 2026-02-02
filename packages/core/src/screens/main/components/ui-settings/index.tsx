import * as React from 'react';

import {
	Dialog,
	DialogAction,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { columnsFormSchema, UISettingsColumnsForm } from './columns-form';
import { useT } from '../../../../contexts/translations';

interface DialogContextProps {
	setButtonPressHandler: (handler: (() => void) | null) => void;
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
	const buttonPressHandlerRef = React.useRef<(() => void) | null>(null);

	const setButtonPressHandler = React.useCallback((handler: (() => void) | null) => {
		buttonPressHandlerRef.current = handler;
	}, []);

	const handleButtonPress = () => {
		if (buttonPressHandlerRef.current) {
			buttonPressHandlerRef.current();
		}
	};

	const contextValue = React.useMemo(() => ({ setButtonPressHandler }), [setButtonPressHandler]);

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
						<DialogContext.Provider value={contextValue}>{children}</DialogContext.Provider>
					</DialogBody>
					<DialogFooter>
						<DialogClose>{t('Close')}</DialogClose>
						<DialogAction variant="destructive" onPress={handleButtonPress}>
							{t('Restore Default Settings')}
						</DialogAction>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</ErrorBoundary>
	);
};

export { UISettingsDialog, columnsFormSchema, UISettingsColumnsForm, useDialogContext };
