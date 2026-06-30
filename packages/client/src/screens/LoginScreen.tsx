import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';

/**
 * Auth gate screen. Toggles between login and register; on success the auth
 * store flips `isAuthenticated` and RootNavigation swaps to the app stack.
 */
export function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    if (isRegister && !displayName.trim()) {
      setError('Display name is required.');
      return;
    }
    if (isRegister && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      if (isRegister) {
        await register(email.trim(), displayName.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      // No navigation needed — the auth gate re-renders into the app stack.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.logo}>🐾 CodingKitty</Text>
        <Text style={styles.subtitle}>{isRegister ? 'Create an account' : 'Welcome back'}</Text>

        {isRegister && (
          <TextInput
            style={styles.input}
            placeholderTextColor="#999"
            placeholder="Display name"
            autoCapitalize="words"
            value={displayName}
            onChangeText={setDisplayName}
            editable={!submitting}
          />
        )}
        <TextInput
          style={styles.input}
          placeholderTextColor="#999"
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={!submitting}
        />
        <TextInput
          style={styles.input}
          placeholderTextColor="#999"
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!submitting}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{isRegister ? 'Sign up' : 'Log in'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setError(null);
            setMode(isRegister ? 'login' : 'register');
          }}
          disabled={submitting}
        >
          <Text style={styles.toggle}>
            {isRegister
              ? 'Already have an account? Log in'
              : "Don't have an account? Sign up"}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logo: { fontSize: 32, fontWeight: '700', textAlign: 'center', color: '#FF8C00' },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginTop: 8, marginBottom: 32 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: '#fafafa',
    // Explicit color so typed text stays visible in iOS dark mode (default would
    // render white text on this light input background).
    color: '#111',
  },
  error: { color: '#D32F2F', marginBottom: 12, textAlign: 'center' },
  button: {
    backgroundColor: '#FF8C00',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  toggle: { color: '#FF8C00', textAlign: 'center', marginTop: 20, fontSize: 14 },
});
