import { Platform, ViewStyle, TextStyle } from 'react-native';
import { ThemeProps } from '../../lib/theme/types';

interface InputTheme {
  container: ViewStyle;
  inputContainer: (theme: ThemeProps) => ViewStyle;
  iconContainer: ViewStyle;
  input: TextStyle;
  error: (theme: ThemeProps) => TextStyle;
  label: (theme: ThemeProps) => TextStyle;
}

const styles: InputTheme = {
  container: {
    width: '100%',
    paddingHorizontal: 10,
  },
  inputContainer: theme => ({
    flexDirection: 'row',
    borderBottomWidth: 1,
    alignItems: 'center',
    borderColor: theme.INPUT_BORDER_COLOR,
  }),
  iconContainer: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 15,
  },
  input: {
    alignSelf: 'center',
    color: 'black',
    fontSize: 18,
    flex: 1,
    minHeight: 40,
  },
  error: theme => ({
    margin: 5,
    fontSize: 12,
    color: theme.INPUT_ERROR_TEXT_COLOR,
  }),
  label: theme => ({
    fontSize: 16,
    color: theme.INPUT_BORDER_COLOR,
    // ...Platform.select({
    //   android: {
    //     ...fonts.android.bold,
    //   },
    //   default: {
    //     fontWeight: 'bold',
    //   },
    // }),
  }),
};

export default styles;
