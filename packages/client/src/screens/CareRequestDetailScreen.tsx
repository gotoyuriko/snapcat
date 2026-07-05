/**
 * CareRequestDetailScreen — one care request with its full stage timeline
 * (every status change traced) and the action for the current stage:
 * - awaiting_owner: choose the certified location to bring the cat to
 * - in_progress:    submit payment receipt, invoiced amount and in-clinic photos
 * (Requirement 9; stage trail from MedicalRequestEvent.)
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import type { RootStackParamList } from '../navigation';
import { api, ApiError } from '../services/api';
import { CARE_STATUS } from './CareRequestsScreen';

type DetailRoute = RouteProp<RootStackParamList, 'CareRequestDetail'>;

interface StageEvent {
  id: string;
  status: string;
  note: string;
  createdAt: string;
}

interface CareRequestDetail {
  id: string;
  type: 'medical' | 'grooming';
  status: string;
  reason: string;
  rejectionReason: string | null;
  amountCents: number;
  receiptUrl: string | null;
  createdAt: string;
  cat: { id: string; name: string | null; photoUrl: string | null } | null;
  partner: { id: string; name: string; type: string; address: string } | null;
  events: StageEvent[];
}

interface PartnerOption {
  id: string;
  name: string;
  type: 'vet' | 'salon';
  contactEmail: string;
  address: string;
}

interface Picked {
  uri: string;
  name: string;
  mimeType: string;
}

export function CareRequestDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<DetailRoute>();
  const { requestId } = route.params;

  const [request, setRequest] = useState<CareRequestDetail | null>(null);
  const [partners, setPartners] = useState<PartnerOption[] | null>(null);
  const [busy, setBusy] = useState(false);

  // Receipt form state (in_progress stage)
  const [amountText, setAmountText] = useState('');
  const [receipt, setReceipt] = useState<Picked | null>(null);
  const [photos, setPhotos] = useState<Picked[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await api.get<CareRequestDetail>(`/medical-requests/${requestId}`);
      setRequest(data);
      if (data.status === 'awaiting_owner' && partners == null) {
        const p = await api.get<{ partners: PartnerOption[] }>(
          `/medical-requests/partners?type=${data.type}`,
        );
        setPartners(p.partners);
      }
    } catch {
      setRequest(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const choosePartner = async (partner: PartnerOption) => {
    Alert.alert(
      'Confirm location',
      `Bring your cat to ${partner.name}?\n${partner.address}\n\nAfter confirming, our team will arrange the service with this partner and you will be contacted personally to agree on a date.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setBusy(true);
            try {
              await api.post(`/medical-requests/${requestId}/choose-partner`, {
                partnerId: partner.id,
              });
              await load();
            } catch (err) {
              const message =
                err instanceof ApiError
                  ? err.serverMessage ?? err.friendlyMessage
                  : 'Something went wrong.';
              Alert.alert('Could not confirm location', message);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const pickReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled) return;
    const a = result.assets[0];
    setReceipt({ uri: a.uri, name: a.fileName ?? 'receipt.jpg', mimeType: a.mimeType ?? 'image/jpeg' });
  };

  const pickPhotos = async () => {
    const remaining = 3 - photos.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (result.canceled) return;
    setPhotos((prev) =>
      [
        ...prev,
        ...result.assets.map((a, i) => ({
          uri: a.uri,
          name: a.fileName ?? `clinic-photo-${prev.length + i + 1}.jpg`,
          mimeType: a.mimeType ?? 'image/jpeg',
        })),
      ].slice(0, 3),
    );
  };

  const submitReceipt = async () => {
    const amountMyr = parseFloat(amountText.replace(',', '.'));
    if (!receipt) {
      Alert.alert('Receipt required', 'Please attach a photo of your payment receipt.');
      return;
    }
    if (!Number.isFinite(amountMyr) || amountMyr <= 0) {
      Alert.alert('Amount required', 'Please enter the amount you paid (RM).');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('amountCents', String(Math.round(amountMyr * 100)));
      form.append('receipt', {
        uri: receipt.uri,
        name: receipt.name,
        type: receipt.mimeType,
      } as unknown as Blob);
      for (const photo of photos) {
        form.append('photos', {
          uri: photo.uri,
          name: photo.name,
          type: photo.mimeType,
        } as unknown as Blob);
      }
      const isResubmission = request?.status === 'rejected';
      await api.postForm(
        `/medical-requests/${requestId}/receipt${isResubmission ? '?resubmission=true' : ''}`,
        form,
      );
      Alert.alert(
        'Documents received',
        'Your receipt and photos were submitted. Once the clinic\'s proof arrives, we will verify both sides and process your reimbursement.',
      );
      setReceipt(null);
      setPhotos([]);
      setAmountText('');
      await load();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.serverMessage ?? err.friendlyMessage : 'Something went wrong.';
      Alert.alert('Submission failed', message);
    } finally {
      setBusy(false);
    }
  };

  if (request == null) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF8C00" />
        </View>
      </SafeAreaView>
    );
  }

  const status = CARE_STATUS[request.status] ?? {
    label: request.status,
    color: '#999',
    hint: '',
    actionNeeded: false,
  };
  // A rejected-for-documentation request may resubmit (rejected → reimbursed).
  const canSubmitDocs =
    request.status === 'in_progress' ||
    (request.status === 'rejected' && request.receiptUrl != null);

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
        <Text style={styles.headerTitle}>
          {request.type === 'medical' ? 'Medical' : 'Grooming'} Request
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Summary */}
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <Text style={styles.catName}>{request.cat?.name ?? 'Unnamed cat'}</Text>
            <View style={[styles.statusBadge, { backgroundColor: status.color }]}>
              <Text style={styles.statusBadgeText}>{status.label}</Text>
            </View>
          </View>
          <Text style={styles.reasonText}>{request.reason}</Text>
          {request.partner && (
            <Text style={styles.partnerLine}>
              📍 {request.partner.name} · {request.partner.address}
            </Text>
          )}
          {status.hint ? <Text style={styles.hintText}>{status.hint}</Text> : null}
          {request.status === 'rejected' && request.rejectionReason ? (
            <Text style={styles.rejectedText}>Reason: {request.rejectionReason}</Text>
          ) : null}
          {request.status === 'reimbursed' && request.amountCents > 0 && (
            <Text style={styles.reimbursedText}>
              RM {(request.amountCents / 100).toFixed(2)} reimbursed to your wallet
            </Text>
          )}
        </View>

        {/* Stage action: choose a location */}
        {request.status === 'awaiting_owner' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              Choose a certified {request.type === 'medical' ? 'vet clinic' : 'grooming salon'}
            </Text>
            <Text style={styles.hintText}>
              Pick the location you want to bring your cat to at your convenience. Our team
              will then arrange the service with them.
            </Text>
            {partners == null ? (
              <ActivityIndicator size="small" color="#FF8C00" style={{ marginVertical: 12 }} />
            ) : partners.length === 0 ? (
              <Text style={styles.hintText}>No certified partners available yet.</Text>
            ) : (
              partners.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.partnerCard}
                  onPress={() => choosePartner(p)}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={styles.partnerName}>
                    {p.type === 'vet' ? '🏥' : '✂️'} {p.name}
                  </Text>
                  <Text style={styles.partnerDetail}>📍 {p.address}</Text>
                  <Text style={styles.partnerDetail}>{p.contactEmail}</Text>
                  <Text style={styles.chooseText}>Tap to choose this location ›</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Stage action: submit receipt + photos */}
        {canSubmitDocs && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {request.status === 'rejected' ? 'Resubmit your documents' : 'After your visit'}
            </Text>
            <Text style={styles.hintText}>
              Pay the {request.type === 'medical' ? 'clinic' : 'salon'} with your own money, then
              submit your receipt and photos taken during the visit (bringing your cat in,
              treatment, etc.). The partner provides their proof on their side — once both match,
              your reimbursement is sent to your wallet.
            </Text>

            <Text style={styles.fieldLabel}>Amount paid (RM)</Text>
            <TextInput
              style={styles.amountInput}
              value={amountText}
              onChangeText={setAmountText}
              placeholder="e.g. 120.00"
              placeholderTextColor="#999"
              keyboardType="decimal-pad"
            />

            <Text style={styles.fieldLabel}>Payment receipt</Text>
            {receipt ? (
              <View style={styles.thumbWrap}>
                <Image source={{ uri: receipt.uri }} style={styles.thumb} />
                <TouchableOpacity style={styles.removeBadge} onPress={() => setReceipt(null)}>
                  <Text style={styles.removeBadgeText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addBtn} onPress={pickReceipt} accessibilityRole="button">
                <Text style={styles.addBtnText}>＋ Attach receipt</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.fieldLabel}>Photos from the visit (up to 3)</Text>
            <View style={styles.photosRow}>
              {photos.map((p) => (
                <View key={p.uri} style={styles.thumbWrap}>
                  <Image source={{ uri: p.uri }} style={styles.thumb} />
                  <TouchableOpacity
                    style={styles.removeBadge}
                    onPress={() => setPhotos((prev) => prev.filter((x) => x.uri !== p.uri))}
                  >
                    <Text style={styles.removeBadgeText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < 3 && (
                <TouchableOpacity style={styles.addTile} onPress={pickPhotos} accessibilityRole="button">
                  <Text style={styles.addTileText}>＋</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, busy && styles.submitBtnDisabled]}
              onPress={submitReceipt}
              disabled={busy}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Documents</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Stage timeline */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Progress</Text>
          {request.events.length === 0 ? (
            <Text style={styles.hintText}>No stage changes recorded yet.</Text>
          ) : (
            request.events.map((e, i) => {
              const cfg = CARE_STATUS[e.status];
              const isLast = i === request.events.length - 1;
              return (
                <View key={e.id} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View
                      style={[styles.timelineDot, { backgroundColor: cfg?.color ?? '#999' }]}
                    />
                    {!isLast && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineBody}>
                    <Text style={styles.timelineTitle}>{cfg?.label ?? e.status}</Text>
                    {e.note ? <Text style={styles.timelineNote}>{e.note}</Text> : null}
                    <Text style={styles.timelineDate}>
                      {new Date(e.createdAt).toLocaleString()}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catName: { fontSize: 17, fontWeight: '700', color: '#333' },
  statusBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  reasonText: { fontSize: 14, color: '#555', marginTop: 8, lineHeight: 20 },
  partnerLine: { fontSize: 13, color: '#555', marginTop: 8 },
  hintText: { fontSize: 13, color: '#888', marginTop: 8, lineHeight: 18 },
  rejectedText: { fontSize: 13, color: '#E53935', marginTop: 8 },
  reimbursedText: { fontSize: 13, color: '#2E7D32', fontWeight: '600', marginTop: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  partnerCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    backgroundColor: '#fafafa',
  },
  partnerName: { fontSize: 15, fontWeight: '600', color: '#333' },
  partnerDetail: { fontSize: 12, color: '#777', marginTop: 2 },
  chooseText: { fontSize: 12, color: '#FF8C00', fontWeight: '600', marginTop: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#333', marginTop: 14, marginBottom: 6 },
  amountInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  addBtn: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  addBtnText: { color: '#FF8C00', fontWeight: '600', fontSize: 14 },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { position: 'relative', alignSelf: 'flex-start' },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#eee' },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#333',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  addTile: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  addTileText: { fontSize: 26, color: '#FF8C00' },
  submitBtn: {
    backgroundColor: '#FF8C00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  timelineRow: { flexDirection: 'row', marginTop: 10 },
  timelineRail: { width: 24, alignItems: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  timelineLine: { flex: 1, width: 2, backgroundColor: '#eee', marginTop: 2 },
  timelineBody: { flex: 1, paddingLeft: 8, paddingBottom: 12 },
  timelineTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  timelineNote: { fontSize: 12, color: '#777', marginTop: 2, lineHeight: 17 },
  timelineDate: { fontSize: 11, color: '#bbb', marginTop: 3 },
});
