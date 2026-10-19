// Icon fonts are native assets; render a plain placeholder in tests.
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text } = require('react-native');
  return function Icon({ name }) {
    return <Text>{name}</Text>;
  };
});
