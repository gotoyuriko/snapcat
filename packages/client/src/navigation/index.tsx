import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PermissionsScreen } from '../screens/PermissionsScreen';
import { MapScreen } from '../screens/MapScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { CatpediaScreen } from '../screens/CatpediaScreen';
import { CatProfileScreen } from '../screens/CatProfileScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { WebARFeedingScreen } from '../screens/WebARFeedingScreen';

export type RootStackParamList = {
  Map: undefined;
  Scan: undefined;
  CatProfile: { catId: string };
  Catpedia: undefined;
  Chat: { catId: string };
  Wallet: undefined;
  Permissions: undefined;
  WebARFeeding: { catId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Permissions"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Permissions" component={PermissionsScreen} />
        <Stack.Screen name="Map" component={MapScreen} />
        <Stack.Screen
          name="CatProfile"
          component={CatProfileScreen}
          options={{ title: 'Cat Profile' }}
        />
        <Stack.Screen name="Catpedia" component={CatpediaScreen} />
        <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: 'Wallet' }} />
        <Stack.Screen
          name="Chat"
          component={ChatScreen}
          options={{ title: 'Community Chat' }}
        />
        <Stack.Screen
          name="WebARFeeding"
          component={WebARFeedingScreen}
          options={{ title: 'Feed Cat' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
