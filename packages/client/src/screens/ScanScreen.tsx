import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * TODO: Implement ScanScreen
 * - Camera viewfinder for cat scanning
 * - Capture image and send to recognition API
 * - Display RecognitionResult
 * - If new cat: prompt for name and register
 * - If existing cat: show match and navigate to profile
 */

export function ScanScreen() {
  return (
    <View style={styles.container}>
      <Text>Scan Screen — TODO: Implement camera + recognition API</Text>
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
