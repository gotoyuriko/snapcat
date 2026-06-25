import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * TODO: Implement WalletScreen
 * - Display wallet balance
 * - Transaction history
 * - Top-up / add funds button
 * - Inventory of purchased food items
 */

export function WalletScreen() {
  return (
    <View style={styles.container}>
      <Text>Wallet Screen — TODO: Implement wallet + inventory</Text>
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
