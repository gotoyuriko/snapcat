/**
 * MedicalRequestScreen — submit a medical/grooming care request for a cat.
 *
 * Requirement 9.1: Lvl7+ owners submit a MedicalRequest (server enforces the gate).
 * Requirement 9.4: a reason description AND supporting documents are mandatory.
 * Requirement 9.13: after submission, show the certified partner locations the
 * user must visit for the reimbursement to be processed.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import type { RootStackParamList } from '../navigation';
import { api, ApiError } from '../services/api';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type MedicalRequestRoute = RouteProp<RootStackParamList, 'MedicalRequest'>;

const MAX_DOCUMENTS = 5;

interface PickedDocument {
  uri: string;
  name: string;
  mimeType: string;
}

interface CertifiedPartner {
  id: string;
  name: string;
  type: 'vet' | 'salon';
  contactEmail: string;
  address?: string;
}

interface CreatedRequest {
  id: string;
  status: string;
  certifiedPartners: CertifiedPartner[];
}

export function MedicalRequestScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<MedicalRequestRoute>();
  const { catId } = route.params;

  const [type, setType] = useState<'medical' | 'grooming'>('medical');
  const [reason, setReason] = useState('');
  const [documents, setDocuments] = useState<PickedDocument[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedRequest | null>(null);

  const pickDocuments = async () => {
    const remaining = MAX_DOCUMENTS - documents.length;
    if (remaining <= 0) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_DOCUMENTS} documents.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (result.canceled) return;
    const picked = result.assets.map((a, i) => ({
      uri: a.uri,
      name: a.fileName ?? `document-${documents.length + i + 1}.jpg`,
      mimeType: a.mimeType ?? 'image/jpeg',
    }));
    setDocuments((prev) => [...prev, ...picked].slice(0, MAX_DOCUMENTS));
  };

  const removeDocument = (uri: string) => {
    setDocuments((prev) => prev.filter((d) => d.uri !== uri));
  };

  const canSubmit = reason.trim().length >= 10 && documents.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (reason.trim().length < 10) {
      Alert.alert('Reason required', 'Please describe why care is needed (at least 10 characters).');
      return;
    }
    if (documents.length === 0) {
      Alert.alert('Documents required', 'Please attach at least one photo or vet note.');
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('catId', catId);
      form.append('type', type);
      form.append('reason', reason.trim());
      for (const doc of documents) {
        form.append('documents', {
          uri: doc.uri,
          name: doc.name,
          type: doc.mimeType,
        } as unknown as Blob);
      }
      const response = await api.postForm<CreatedRequest>('/medical-requests', form);
      setCreated(response);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.serverMessage ?? err.friendlyMessage
          : 'Something went wrong. Please try again.';
      Alert.alert('Submission failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  // Post-submission view: confirmation + certified partner locations (Req 9.13)
  if (created) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>✅ Request Received</Text>
        <Text style={styles.paragraph}>
          Your {type} request has been received and is under review by our staff team. Once
          approved, you'll be asked to choose the location you want to bring your cat to —
          track everything under Profile → Care Requests.
        </Text>
        <Text style={styles.sectionTitle}>
          Nearby certified {type === 'medical' ? 'clinics' : 'grooming salons'}
        </Text>
        <Text style={styles.paragraph}>
          Reimbursement from the community pool is only processed if the care is provided by
          one of these certified partners:
        </Text>
        {created.certifiedPartners.length === 0 ? (
          <Text style={styles.emptyText}>
            No certified partners are registered yet. Staff will assign one during review.
          </Text>
        ) : (
          created.certifiedPartners.map((partner) => (
            <View key={partner.id} style={styles.partnerCard}>
              <Text style={styles.partnerName}>
                {partner.type === 'vet' ? '🏥' : '✂️'} {partner.name}
              </Text>
              <Text style={styles.partnerDetail}>
                {partner.type === 'vet' ? 'Veterinary clinic' : 'Grooming salon'} ·{' '}
                {partner.contactEmail}
              </Text>
              {partner.address ? (
                <Text style={styles.partnerDetail}>📍 {partner.address}</Text>
              ) : null}
            </View>
          ))
        )}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
        >
          <Text style={styles.submitButtonText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>Request Medical / Grooming Care</Text>

      <Text style={styles.sectionTitle}>Type of care</Text>
      <View style={styles.typeRow}>
        {(['medical', 'grooming'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.typeButton, type === t && styles.typeButtonActive]}
            onPress={() => setType(t)}
            accessibilityRole="button"
            accessibilityState={{ selected: type === t }}
          >
            <Text style={[styles.typeButtonText, type === t && styles.typeButtonTextActive]}>
              {t === 'medical' ? '🏥 Medical' : '✂️ Grooming'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Why is care needed?</Text>
      <TextInput
        style={styles.reasonInput}
        value={reason}
        onChangeText={setReason}
        placeholder="Describe the cat's condition or need (min 10 characters)…"
        placeholderTextColor="#999"
        multiline
        numberOfLines={4}
        maxLength={2000}
        textAlignVertical="top"
      />

      <Text style={styles.sectionTitle}>Supporting documents</Text>
      <Text style={styles.hintText}>
        Attach photos or vet notes (required, up to {MAX_DOCUMENTS}).
      </Text>
      <View style={styles.documentsRow}>
        {documents.map((doc) => (
          <View key={doc.uri} style={styles.documentThumbWrap}>
            <Image source={{ uri: doc.uri }} style={styles.documentThumb} />
            <TouchableOpacity
              style={styles.removeBadge}
              onPress={() => removeDocument(doc.uri)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${doc.name}`}
            >
              <Text style={styles.removeBadgeText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        {documents.length < MAX_DOCUMENTS && (
          <TouchableOpacity
            style={styles.addDocumentButton}
            onPress={pickDocuments}
            accessibilityRole="button"
            accessibilityLabel="Add document"
          >
            <Text style={styles.addDocumentText}>＋</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Submit Request</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 40 },
  headerRow: { marginBottom: 8 },
  backText: { fontSize: 16, color: '#FF8C00', fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', color: '#333', marginBottom: 16, marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 16, marginBottom: 8 },
  paragraph: { fontSize: 14, color: '#555', lineHeight: 20, marginBottom: 8 },
  hintText: { fontSize: 13, color: '#888', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#888', fontStyle: 'italic', marginVertical: 8 },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  typeButtonActive: { borderColor: '#FF8C00', backgroundColor: '#FFF3E0' },
  typeButtonText: { fontSize: 15, color: '#666', fontWeight: '500' },
  typeButtonTextActive: { color: '#FF8C00', fontWeight: '700' },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  documentsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  documentThumbWrap: { position: 'relative' },
  documentThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#eee' },
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
  addDocumentButton: {
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
  addDocumentText: { fontSize: 26, color: '#FF8C00' },
  submitButton: {
    backgroundColor: '#FF8C00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: { backgroundColor: '#ccc' },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  partnerCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#fafafa',
  },
  partnerName: { fontSize: 15, fontWeight: '600', color: '#333' },
  partnerDetail: { fontSize: 13, color: '#777', marginTop: 2 },
});
