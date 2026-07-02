import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';

interface MeResponse {
  userId: string;
  email: string;
}

interface WalletInfo {
  balance: number; // MYR cents
}

export function ProfileScreen() {
  const navigation = useNavigation();
  const logout = useAuth((s) => s.logout);

  const [email, setEmail] = useState<string | null>(null);
  const [balanceMyr, setBalanceMyr] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [me, wallet] = await Promise.all([
          api.get<MeResponse>('/auth/me'),
          api.get<WalletInfo>('/wallet/balance'),
        ]);
        setEmail(me.email);
        setBalanceMyr(wallet.balance / 100);
      } catch {
        // Leave fields blank — non-critical for this screen
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.avatarSection}>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={40} color="#fff" />
        </View>
        {loading ? (
          <ActivityIndicator size="small" color="#FF8C00" style={{ marginTop: 12 }} />
        ) : (
          <Text style={styles.email}>{email ?? 'Unknown user'}</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Wallet Balance</Text>
        <Text style={styles.cardValue}>
          {balanceMyr != null ? `RM ${balanceMyr.toFixed(2)}` : '—'}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        accessibilityLabel="Log out"
        accessibilityRole="button"
      >
        <Ionicons name="log-out-outline" size={20} color="#e53935" />
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  headerSpacer: {
    width: 40,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  email: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardLabel: {
    fontSize: 13,
    color: '#999',
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FF8C00',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#FFF0F0',
    gap: 8,
  },
  logoutText: {
    color: '#e53935',
    fontSize: 15,
    fontWeight: '600',
  },
});
