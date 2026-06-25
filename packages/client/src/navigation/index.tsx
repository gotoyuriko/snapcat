import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// TODO: Import screens
// import { MapScreen } from '../screens/MapScreen';
// import { ScanScreen } from '../screens/ScanScreen';
// import { CatProfileScreen } from '../screens/CatProfileScreen';
// import { CatpediaScreen } from '../screens/CatpediaScreen';
// import { ChatScreen } from '../screens/ChatScreen';
// import { WalletScreen } from '../screens/WalletScreen';
// import { PermissionsScreen } from '../screens/PermissionsScreen';
// import { WebARFeedingScreen } from '../screens/WebARFeedingScreen';

/**
 * TODO: Define navigation param list type
 * MapScreen — Main map view with cat pins
 * ScanScreen — Camera for cat recognition
 * CatProfileScreen — Individual cat profile
 * CatpediaScreen — Cat breed encyclopedia
 * ChatScreen — Cat community chat
 * WalletScreen — User wallet and donations
 * PermissionsScreen — App permissions setup
 * WebARFeedingScreen — AR-based virtual feeding experience
 */

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
      <Stack.Navigator initialRouteName="Map">
        {/* TODO: Add screen components */}
        {/* <Stack.Screen name="Map" component={MapScreen} /> */}
        {/* <Stack.Screen name="Scan" component={ScanScreen} /> */}
        {/* <Stack.Screen name="CatProfile" component={CatProfileScreen} /> */}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
