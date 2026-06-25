import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * TODO: Implement PermissionsScreen
 * - Request camera permission for cat scanning
 * - Request location permission for map/sightings
 * - Request notification permission for alerts
 * - Show status of each permission with toggle/request buttons
 */

export function PermissionsScreen() {
  return (
    <View style={styles.container}>
      <Text>Permissions Screen — TODO: Implement permission requests</Text>
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
