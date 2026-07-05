/**
 * CareRequestsScreen — the user's medical/grooming requests with their
 * current stage. Tapping a request opens its detail page with the full
 * stage timeline and any action required (Requirement 9).
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { api } from '../services/api';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export interface CareRequestSummary {
  id: string;
  type: 'medical' | 'grooming';
  status: string;
  reason: string;
  rejectionReason: string | null;
  amountCents: number;
  createdAt: string;
  cat: { id: string; name: string | null } | null;
  partner: { id: string; name: string; type: string; address: string } | null;
}

/** Display config per care-request stage. */
export const CARE_STATUS: Record<
  string,
  { label: string; color: string; hint: string; actionNeeded: boolean }
> = {
  pending: {
    label: 'Pending request',
    color: '#F9A825',
    hint: 'Waiting for approval from the staff team',
    actionNeeded: false,
  },
  awaiting_owner: {
    label: 'Choose a location',
    color: '#8E24AA',
    hint: 'Action needed: pick the certified location for your cat',
    actionNeeded: true,
  },
  pending_review: {
    label: 'Pending review',
    color: '#F9A825',
    hint: 'Staff are arranging with your chosen clinic',
    actionNeeded: false,
  },
  in_progress: {
    label: 'In progress',
    color: '#1E88E5',
    hint: 'Complete the visit within 30 days, then submit your receipt & photos',
    actionNeeded: true,
  },
  reimbursed: {
    label: 'Reimbursed',
    color: '#2E7D32',
    hint: 'Contribution confirmed — reimbursement sent',
    actionNeeded: false,
  },
  rejected: {
    label: 'Rejected',
    color: '#E53935',
    hint: '',
    actionNeeded: false,
  },
  timed_out: {
    label: 'Timed out',
    color: '#757575',
    hint: 'The 30-day service window elapsed',
    actionNeeded: false,
  },
};

export function CareRequestsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [requests, setRequests] = useState<CareRequestSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ requests: CareRequestSummary[] }>('/medical-requests/mine');
      setRequests(data.requests);
    } catch {
      setRequests([]);
    }
  }, []);

  // Refresh whenever the screen gains focus (e.g. returning from detail).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

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
        <Text style={styles.headerTitle}>Care Requests</Text>
        <View style={styles.headerSpacer} />
      </View>

      {requests == null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF8C00" />
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="medkit-outline" size={40} color="#ccc" />
          <Text style={styles.emptyText}>
            No medical or grooming requests yet.{'\n'}Reach Level 7 with a cat to request care.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {requests.map((r) => {
            const status = CARE_STATUS[r.status] ?? {
              label: r.status,
              color: '#999',
              hint: '',
              actionNeeded: false,
            };
            return (
              <TouchableOpacity
                key={r.id}
                style={styles.card}
                onPress={() => navigation.navigate('CareRequestDetail', { requestId: r.id })}
                accessibilityRole="button"
              >
                <View style={styles.cardHeader}>
                  <Ionicons
                    name={r.type === 'medical' ? 'medkit-outline' : 'cut-outline'}
                    size={20}
                    color="#FF8C00"
                  />
                  <Text style={styles.cardTitle}>
                    {r.type === 'medical' ? 'Medical' : 'Grooming'} · {r.cat?.name ?? 'Unnamed cat'}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: status.color }]}>
                    <Text style={styles.statusText}>{status.label}</Text>
                  </View>
                </View>
                <Text style={styles.cardSub}>
                  {new Date(r.createdAt).toLocaleDateString()}
                  {r.partner ? ` · ${r.partner.name}` : ''}
                </Text>
                {status.actionNeeded ? (
                  <View style={styles.actionRow}>
                    <Ionicons name="alert-circle" size={14} color="#8E24AA" />
                    <Text style={styles.actionText}>{status.hint}</Text>
                  </View>
                ) : r.status === 'rejected' && r.rejectionReason ? (
                  <Text style={styles.rejectedText}>Reason: {r.rejectionReason}</Text>
                ) : status.hint ? (
                  <Text style={styles.hintText}>{status.hint}</Text>
                ) : null}
                {r.status === 'reimbursed' && r.amountCents > 0 && (
                  <Text style={styles.reimbursedText}>
                    RM {(r.amountCents / 100).toFixed(2)} reimbursement approved
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  headerSpacer: { width: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 14, color: '#999', textAlign: 'center', marginTop: 12, lineHeight: 20 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#333' },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardSub: { fontSize: 12, color: '#999', marginTop: 4 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  actionText: { fontSize: 12, color: '#8E24AA', fontWeight: '600', flex: 1 },
  hintText: { fontSize: 12, color: '#888', marginTop: 6 },
  rejectedText: { fontSize: 12, color: '#E53935', marginTop: 6 },
  reimbursedText: { fontSize: 12, color: '#2E7D32', fontWeight: '600', marginTop: 6 },
});
