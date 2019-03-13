// import React, { Component, ReactNode } from 'react';
// import { View, Animated, TouchableWithoutFeedback, Text } from 'react-native';
// import Icon from '../icon';
// // import styles from './styles';

// interface Props {
//   children?: ReactNode;
//   style?: any;
//   numeric?: boolean;
//   sortDirection?: 'ascending' | 'descending';
//   onPress?: () => void;
// }

// interface State {
//   spinAnim: Animated.Value;
// }

// class Title extends Component<Props, State> {
//   state = {
//     spinAnim: new Animated.Value(this.props.sortDirection === 'ascending' ? 0 : 1),
//   };

//   componentDidUpdate(prevProps: Props) {
//     if (prevProps.sortDirection === this.props.sortDirection) {
//       return;
//     }

//     Animated.timing(this.state.spinAnim, {
//       toValue: this.props.sortDirection === 'ascending' ? 0 : 1,
//       duration: 150,
//       useNativeDriver: true,
//     }).start();
//   }

//   render() {
//     const { children, onPress, sortDirection, style, styles = {}, ...rest } = this.props;

//     const spin = this.state.spinAnim.interpolate({
//       inputRange: [0, 1],
//       outputRange: ['0deg', '180deg'],
//     });

//     const icon = sortDirection ? (
//       <Animated.View style={[styles.sortIcon, { transform: [{ rotate: spin }] }]}>
//         <Icon name="arrow-downward" size={16} />
//       </Animated.View>
//     ) : null;

//     return (
//       <TouchableWithoutFeedback onPress={onPress} {...rest}>
//         <View style={[styles.titleContainer, style]}>
//           {icon}

//           <Text style={[styles.titleText]} numberOfLines={1}>
//             {children}
//           </Text>
//         </View>
//       </TouchableWithoutFeedback>
//     );
//   }
// }

// export default Title;
