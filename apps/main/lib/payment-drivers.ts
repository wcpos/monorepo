import { Platform } from 'react-native';

import { registerDriver } from '@wcpos/core/services/payment-drivers/registry';
import { createSimulatedDriver } from '@wcpos/core/services/payment-drivers/simulated-driver';

if (__DEV__ || Platform.OS === 'web') registerDriver(createSimulatedDriver());
