
import { Platform } from 'react-native';

const usePlatform = () => {
  const isWeb = Platform.OS === 'web';
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

  return { isWeb, isNative };
};

export default usePlatform;
