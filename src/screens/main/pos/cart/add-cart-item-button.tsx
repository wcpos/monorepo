import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/src/button';
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogBody,
	DialogFooter,
} from '@wcpos/components/src/dialog';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { IconButton } from '@wcpos/components/src/icon-button';
import { Text } from '@wcpos/components/src/text';

import { useT } from '../../../../contexts/translations';

interface DialogContextProps {
	buttonPressHandlerRef: React.MutableRefObject<(() => void) | null>;
	setOpenDialog: React.Dispatch<React.SetStateAction<boolean>>;
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
const AddCartItemButton = ({ title, children }: Props) => {
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
				<DialogTrigger asChild>
					<IconButton name="circlePlus" />
				</DialogTrigger>
				<DialogContext.Provider value={{ buttonPressHandlerRef, setOpenDialog }}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>
								<Text>{title}</Text>
							</DialogTitle>
						</DialogHeader>
						<DialogBody>{children}</DialogBody>
						<DialogFooter>
							<Button onPress={handleButtonPress}>
								<ButtonText>{t('Add to Cart', { _tags: 'core' })}</ButtonText>
							</Button>
						</DialogFooter>
					</DialogContent>
				</DialogContext.Provider>
			</Dialog>
		</ErrorBoundary>
	);
};

export { AddCartItemButton, useDialogContext };
