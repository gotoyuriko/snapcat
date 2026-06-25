import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * TODO: Implement ChatScreen
 * - Real-time chat using Socket.io
 * - Message list with sender info
 * - Text input with send button
 * - Load message history on mount
 * - Join/leave socket room on mount/unmount
 */

export function ChatScreen() {
  return (
    <View style={styles.container}>
      <Text>Chat Screen — TODO: Implement real-time messaging</Text>
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
