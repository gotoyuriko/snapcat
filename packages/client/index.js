import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// and sets up the environment for Expo Go and native dev/standalone builds.
// This must run as the app entry (see "main" in package.json); pointing "main"
// straight at App.tsx skipped registration, causing "App entry not found".
registerRootComponent(App);
