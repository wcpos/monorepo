import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

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
import { Form, useFormChangeHandler } from '@wcpos/components/form';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';

import { columnsFormSchema, UISettingsColumnsForm } from './columns-form';
import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';

type ColumnsOnlySettingsID = 'coupons' | 'customers' | 'orders' | 'reports-orders';

const columnsOnlyFormSchema = z.object({
	...columnsFormSchema.shape,
});

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

function UISettingsColumnsOnlyForm({ id }: { id: ColumnsOnlySettingsID }) {
	const { uiSettings, getUILabel, resetUI, patchUI } = useUISettings(id);
	const formData = useDocField(uiSettings, (value) => value);
	const { setButtonPressHandler } = useDialogContext();

	/**
	 * The reset button lives in the dialog footer, outside this form's subtree, so the
	 * handler has to be published back up to UISettingsDialog. It lands in a ref there,
	 * and writing a ref during render is not allowed — hence an effect rather than a
	 * plain call. Nothing here derives state; it only registers the callback.
	 */
	React.useEffect(() => {
		setButtonPressHandler(() => void resetUI());
	}, [setButtonPressHandler, resetUI]);

	const form = useForm<z.infer<typeof columnsOnlyFormSchema>>({
		resolver: zodResolver(columnsOnlyFormSchema as never) as never,
		values: formData,
	});

	useFormChangeHandler({ form: form as never, onChange: (changes) => void patchUI(changes) });

	return (
		<Form {...form}>
			<VStack>
				<UISettingsColumnsForm getUILabel={getUILabel} />
			</VStack>
		</Form>
	);
}

interface Props {
	title: string;
	children: React.ReactNode;
	triggerTestID?: string;
}

/**
 *
 */
function UISettingsDialog({ title, children, triggerTestID }: Props) {
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
						<IconButton name="sliders" testID={triggerTestID} />
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
						<DialogClose>{t('common.close')}</DialogClose>
						<DialogAction
							{...({ variant: 'destructive' } as Record<string, unknown>)}
							onPress={handleButtonPress}
						>
							{t('common.restore_default_settings')}
						</DialogAction>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</ErrorBoundary>
	);
}

export {
	UISettingsDialog,
	UISettingsColumnsOnlyForm,
	columnsFormSchema,
	columnsOnlyFormSchema,
	UISettingsColumnsForm,
	useDialogContext,
};
