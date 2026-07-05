import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation';
import { api, ApiError } from '../services/api';

/**
 * Medical / Grooming request screen (Requirement 9).
 * - Lvl7+ owners submit a request with a reason and supporting documents
 *   (Req 9.1, 9.4); the server enforces the ownership gate (Req 9.2).
 * - Certified partner locations are shown when initiating (Req 9.13).
 * - Past requests for this cat are listed with their workflow status.
 */

interface Partner {
  id: string;
  name: string;
  type: 'vet' | 'salon';
  contactEmail: string;
}

interface MedicalRequestEntry {
  id: string;
  type: 'medical' | 'grooming';
  reason: string;
  status: string;
  createdAt: string;
  partner: { name: string; type: string } | null;
}

interface PickedDocument {
  uri: string;
  name: string;
  mimeType: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#FF9800',
  verified: '#2196F3',
  in_progress: '#2196F3',
  reimbursed: '#4CAF50',
  rejected: '#F44336',
  timed_out: '#9E9E9E',
};

const MIN_REASON_LENGTH = 10;
const MAX_DOCUMENTS = 5;

export function MedicalRequestScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'MedicalRequest'>>();
  const { catId } = route.params;

  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [requests, setRequests] = useState<MedicalRequestEntry[] | null>(null);

  const [type, setType] = useState<'medical' | 'grooming'>('medical');
  const [reason, setReason] = useState('');
  const [documents, setDocuments] = useState<PickedDocument[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [partnerData, requestData] = await Promise.all([
        api.get<{ certifiedPartners: Partner[] }>('/medical-requests/partners'),
        api.get<{ requests: MedicalRequestEntry[] }>(`/medical-requests/cat/${catId}/mine`),
      ]);
      setPartners(partnerData.certifiedPartners);
      setRequests(requestData.requests);
    } catch {
      setPartners([]);
      setRequests([]);
    }
  }, [catId]);

  useEffect(() => {
    load();
  }, [load]);

  const pickDocument = async () => {
    if (documents.length >= MAX_DOCUMENTS) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_DOCUMENTS} documents.`);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Photo library access is required to attach documents.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (picked.canceled || picked.assets.length === 0) return;
    const asset = picked.assets[0];
    setDocuments((prev) => [
      ...prev,
      {
        uri: asset.uri,
        name: asset.fileName ?? `document-${prev.length + 1}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      },
    ]);
  };

  const removeDocument = (uri: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.uri !== uri));
  };

  const handleSubmit = async () => {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < MIN_REASON_LENGTH) {
      Alert.alert(
        'Reason required',
        `Please describe why care is needed (at least ${MIN_REASON_LENGTH} characters).`,
      );
      return;
    }
    if (documents.length === 0) {
      // Req 9.4: supporting documentation is mandatory
      Alert.alert('Documents required', 'Please attach at least one photo or vet note.');
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('catId', catId);
      form.append('type', type);
      form.append('reason', trimmedReason);
      for (const doc of documents) {
        form.append('documents', {
          uri: doc.uri,
          name: doc.name,
          type: doc.mimeType,
        } as unknown as Blob);
      }

      await api.postForm('/medical-requests', form);

      Alert.alert(
        'Request Submitted',
        'Your request is pending staff review. Reimbursement is only available when you visit a certified partner listed below.',
      );
      setReason('');
      setDocuments([]);
      load();
    } catch (err) {
      Alert.alert(
        'Submission failed',
        err instanceof ApiError ? err.friendlyMessage : 'Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Medical / Grooming Request</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Type selector */}
        <Text style={styles.label}>Type of care</Text>
        <View style={styles.typeRow}>
          {(['medical', 'grooming'] as const).map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.typeChip, type === option && styles.typeChipActive]}
              onPress={() => setType(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected: type === option }}
            >
              <Ionicons
                name={option === 'medical' ? 'medkit-outline' : 'cut-outline'}
                size={16}
                color={type === option ? '#fff' : '#FF8C00'}
              />
              <Text style={[styles.typeChipText, type === option && styles.typeChipTextActive]}>
                {option === 'medical' ? 'Medical' : 'Grooming'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Reason (Req 9.4) */}
        <Text style={styles.label}>Why does this cat need care?</Text>
        <TextInput
          style={styles.reasonInput}
          value={reason}
          onChangeText={setReason}
          placeholder="Describe the symptoms or condition (min 10 characters)…"
          placeholderTextColor="#999"
          multiline
          maxLength={1000}
        />

        {/* Supporting documents (Req 9.4) */}
        <Text style={styles.label}>Supporting documents</Text>
        <Text style={styles.hint}>Photos of the cat's condition, vet notes, etc. (1–5 required)</Text>
        <View style={styles.docRow}>
          {documents.map((doc) => (
            <View key={doc.uri} style={styles.docThumbWrap}>
              <Image source={{ uri: doc.uri }} style={styles.docThumb} />
              <TouchableOpacity
                style={styles.docRemove}
                onPress={() => removeDocument(doc.uri)}
                accessibilityLabel={`Remove ${doc.name}`}
              >
                <Ionicons name="close-circle" size={20} color="#F44336" />
              </TouchableOpacity>
            </View>
          ))}
          {documents.length < MAX_DOCUMENTS && (
            <TouchableOpacity
              style={styles.docAdd}
              onPress={pickDocument}
              accessibilityLabel="Attach a document"
              accessibilityRole="button"
            >
              <Ionicons name="add" size={28} color="#FF8C00" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          accessibilityLabel="Submit request"
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitText}>Submit Request</Text>
          )}
        </TouchableOpacity>

        {/* Certified partners (Req 9.13) */}
        <Text style={styles.sectionTitle}>Certified Partners</Text>
        <Text style={styles.hint}>
          Reimbursement is only processed for visits to these verified clinics and salons.
        </Text>
        {partners == null ? (
          <ActivityIndicator size="small" color="#FF8C00" style={styles.spinner} />
        ) : partners.length === 0 ? (
          <Text style={styles.emptyText}>No certified partners are available yet.</Text>
        ) : (
          partners.map((partner) => (
            <View key={partner.id} style={styles.partnerCard}>
              <Ionicons
                name={partner.type === 'vet' ? 'medkit' : 'cut'}
                size={20}
                color="#FF8C00"
              />
              <View style={styles.partnerMain}>
                <Text style={styles.partnerName}>{partner.name}</Text>
                <Text style={styles.partnerMeta}>
                  {partner.type === 'vet' ? 'Veterinary clinic' : 'Grooming salon'} ·{' '}
                  {partner.contactEmail}
                </Text>
              </View>
            </View>
          ))
        )}

        {/* Past requests */}
        <Text style={styles.sectionTitle}>Your Requests</Text>
        {requests == null ? (
          <ActivityIndicator size="small" color="#FF8C00" style={styles.spinner} />
        ) : requests.length === 0 ? (
          <Text style={styles.emptyText}>No requests yet for this cat.</Text>
        ) : (
          requests.map((request) => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestTop}>
                <Text style={styles.requestType}>
                  {request.type === 'medical' ? 'Medical' : 'Grooming'}
                </Text>
                <View
                  style={[
                    styles.statusChip,
                    { backgroundColor: STATUS_COLORS[request.status] ?? '#9E9E9E' },
                  ]}
                >
                  <Text style={styles.statusChipText}>{request.status.replace('_', ' ')}</Text>
                </View>
              </View>
              <Text style={styles.requestReason} numberOfLines={2}>
                {request.reason}
              </Text>
              <Text style={styles.requestMeta}>
                {new Date(request.createdAt).toLocaleDateString()}
                {request.partner ? ` · ${request.partner.name}` : ''}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: { marginRight: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  body: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 14, marginBottom: 6 },
  hint: { fontSize: 12, color: '#888', marginBottom: 8 },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#FF8C00',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  typeChipActive: { backgroundColor: '#FF8C00' },
  typeChipText: { color: '#FF8C00', fontWeight: '600' },
  typeChipTextActive: { color: '#fff' },
  reasonInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    minHeight: 90,
    textAlignVertical: 'top',
    fontSize: 14,
    color: '#333',
  },
  docRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  docThumbWrap: { position: 'relative' },
  docThumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#EEE' },
  docRemove: { position: 'absolute', top: -8, right: -8 },
  docAdd: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#FF8C00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    backgroundColor: '#FF8C00',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 20,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginTop: 26, marginBottom: 4 },
  spinner: { marginVertical: 12 },
  emptyText: { fontSize: 13, color: '#999', marginTop: 6 },
  partnerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  partnerMain: { flex: 1 },
  partnerName: { fontSize: 14, fontWeight: '600', color: '#333' },
  partnerMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  requestCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  requestTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  requestType: { fontSize: 14, fontWeight: '600', color: '#333' },
  statusChip: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusChipText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  requestReason: { fontSize: 13, color: '#666', marginTop: 6 },
  requestMeta: { fontSize: 12, color: '#999', marginTop: 4 },
});
