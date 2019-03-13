import React from 'react';
import { View } from 'react-native';
import Icon from '../icon';

interface Props {
  className?: string;
  componentStack?: string;
  error?: Error;
}

/**
 *
 */
const Fallback = ({ componentStack, error }: Props) => (
  <View>
    <Icon name="exclamation-circle" />
    <p>We're sorry — something's gone wrong.</p>
    <p>Our team has been notified, but click here fill out a report.</p>
    {error && (
      <pre>
        {error.toString()}
        <br />
        <br />
        This is located at: {componentStack}
      </pre>
    )}
  </View>
);

export default Fallback;
