import React from 'react';
import { ThemeProvider } from 'styled-components/native';
import { DatabaseProvider } from './hooks/use-database-context';
import Navigator from './navigators';
import ActivityIndicator from './components/activity-indicator';
import Portal from './components/portal';
import { defaultTheme } from './lib/theme';
import * as UI from './hooks/use-ui';

// import i18n
import i18n from './lib/i18n';

//
import 'react-native-gesture-handler';

const App = () => (
	<React.StrictMode>
		<React.Suspense fallback={<ActivityIndicator />}>
			<DatabaseProvider>
				<UI.Provider>
					<ThemeProvider theme={defaultTheme}>
						<Portal.Host>
							<Navigator />
						</Portal.Host>
					</ThemeProvider>
				</UI.Provider>
			</DatabaseProvider>
		</React.Suspense>
	</React.StrictMode>
);

export default App;
