import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * TODO: Implement MapScreen
 * - Display react-native-maps with cat sighting pins
 * - Show user's current location
 * - Cluster nearby pins
 * - Tap on pin to navigate to CatProfileScreen
 * - Floating action button to navigate to ScanScreen
 */

export function MapScreen() {
  return (
    <View style={styles.container}>
      <Text>Map Screen — TODO: Implement with react-native-maps</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
