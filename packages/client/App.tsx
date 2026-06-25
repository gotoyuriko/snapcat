import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// TODO: Import navigation
// import { RootNavigation } from './src/navigation';

/**
 * CodingKitty App entry point.
 * TODO: Set up NavigationContainer + auth state + providers
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {/* TODO: Replace with <RootNavigation /> */}
    </SafeAreaProvider>
  );
}
