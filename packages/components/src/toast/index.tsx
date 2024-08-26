import Toast, { ToastConfig } from 'react-native-toast-message';

import { Toast as BaseToast } from './toast';

const toastConfig: ToastConfig = {
	success: (props) => <BaseToast variant="success" {...props} />,
	error: (props) => <BaseToast variant="error" {...props} />,
	info: (props) => <BaseToast variant="info" {...props} />,
};

export { Toast, toastConfig };
