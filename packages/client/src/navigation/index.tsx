import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PermissionsScreen } from '../screens/PermissionsScreen';
import { MapScreen } from '../screens/MapScreen';

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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
