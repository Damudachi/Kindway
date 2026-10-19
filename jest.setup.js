// Icon fonts are native assets; render a plain placeholder in tests.
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text } = require('react-native');
  return function Icon({ name }) {
    return <Text>{name}</Text>;
  };
});

// Device storage is native; use the library's in-memory mock in tests.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
