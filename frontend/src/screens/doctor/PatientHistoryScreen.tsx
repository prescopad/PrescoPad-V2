import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, FlatList, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { DoctorStackParamList } from '../../types/navigation.types';
import { Patient } from '../../types/patient.types';
import { Prescription } from '../../types/prescription.types';
import { getPatientById, getPrescriptionsByPatient, deletePatient } from '../../services/dataService';
import { useQueueStore } from '../../store/useQueueStore';
import { useAuthStore } from '../../store/useAuthStore';
import { ConsultTypeModal } from '../../components/ConsultTypeModal';

export default function PatientHistoryScreen({ navigation, route }: any): React.JSX.Element {
  const { patientId, patientName } = route.params;
  const [patient, setPatient] = useState<Patient | null>(null);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingToQueue, setIsAddingToQueue] = useState(false);
  const [showConsultModal, setShowConsultModal] = useState(false);
  const { addToQueue } = useQueueStore();
  const user = useAuthStore((s) => s.user);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [patientId])
  );

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [p, rxList] = await Promise.all([
        getPatientById(patientId),
        getPrescriptionsByPatient(patientId),
      ]);
      setPatient(p);
      setPrescriptions(rxList);
    } catch {
      Alert.alert('Error', 'Failed to load patient history. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  const handleViewPrescription = (prescriptionId: string) => {
    navigation.navigate('PrescriptionPreview', { prescriptionId, readOnly: true });
  };

  const handleEditPatient = () => {
    navigation.navigate('EditPatient', { patientId });
  };

  const handleAddToQueue = () => {
    if (!user) return;
    setShowConsultModal(true);
  };

  const processAddToQueue = async (type: 'new' | 'follow_up') => {
    setShowConsultModal(false);
    setIsAddingToQueue(true);
    try {
      await addToQueue(patientId, user!.id, undefined, type);
      Alert.alert('Success', `${patientName} added to today's queue!`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to add to queue';
      Alert.alert('Error', msg);
    } finally {
      setIsAddingToQueue(false);
    }
  };

  const handleDeletePatient = () => {
    Alert.alert(
      'Delete Patient',
      `Are you sure you want to permanently delete ${patientName}? This will wipe their entire history, prescriptions, and queue entries. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePatient(patientId);
              Alert.alert('Done', 'Patient and all history deleted successfully.');
              navigation.goBack();
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : 'Failed to delete patient';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {patientName}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleAddToQueue} style={styles.queueButton} disabled={isAddingToQueue}>
            {isAddingToQueue ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
                <Text style={styles.queueButtonText}>Queue</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleEditPatient} style={styles.editButton}>
            <Ionicons name="create-outline" size={22} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDeletePatient} style={styles.deleteButton}>
            <Ionicons name="trash-outline" size={20} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Patient Info Card */}
        {patient && (
          <View style={styles.patientCard}>
            <View style={styles.patientCardHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{patient.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.patientInfo}>
                <Text style={styles.patientName}>{patient.name}</Text>
                <Text style={styles.patientMeta}>
                  {patient.age} yrs / {patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)}
                  {patient.phone ? ` | ${patient.phone}` : ''}
                </Text>
              </View>
            </View>
            <View style={styles.patientDetails}>
              {patient.bloodGroup ? (
                <View style={styles.detailChip}>
                  <Ionicons name="water" size={12} color={COLORS.error} />
                  <Text style={styles.detailChipText}>{patient.bloodGroup}</Text>
                </View>
              ) : null}
              {patient.weight ? (
                <View style={styles.detailChip}>
                  <Ionicons name="fitness" size={12} color={COLORS.primary} />
                  <Text style={styles.detailChipText}>{patient.weight} kg</Text>
                </View>
              ) : null}
              {patient.allergies && !['no', 'none', 'n/a', 'nil', '-', 'nill'].includes(patient.allergies.toLowerCase().trim()) ? (
                <View style={[styles.detailChip, styles.allergyChip]}>
                  <Ionicons name="warning" size={12} color={COLORS.warning} />
                  <Text style={[styles.detailChipText, styles.allergyText]}>{patient.allergies}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* Prescriptions */}
        <View style={styles.sectionHeader}>
          <Ionicons name="document-text-outline" size={20} color={COLORS.textSecondary} />
          <Text style={styles.sectionTitle}>Prescriptions</Text>
          <Text style={styles.sectionCount}>({prescriptions.length})</Text>
        </View>

        {prescriptions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyText}>No prescriptions yet</Text>
          </View>
        ) : (
          prescriptions.map((rx) => (
            <TouchableOpacity
              key={rx.id}
              style={styles.rxCard}
              onPress={() => handleViewPrescription(rx.id)}
              activeOpacity={0.7}
            >
              <View style={styles.rxCardTop}>
                <View style={styles.rxDateBadge}>
                  <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.rxDateText}>{formatDate(rx.createdAt)}</Text>
                </View>
                <View style={[styles.rxStatusBadge, { backgroundColor: rx.status === 'finalized' ? COLORS.successLight : COLORS.warningLight }]}>
                  <Text style={[styles.rxStatusText, { color: rx.status === 'finalized' ? COLORS.success : COLORS.warning }]}>
                    {rx.status === 'finalized' ? 'Issued' : 'Draft'}
                  </Text>
                </View>
              </View>

              {rx.diagnosis ? (
                <Text style={styles.rxDiagnosis} numberOfLines={2}>{rx.diagnosis}</Text>
              ) : null}

              <View style={styles.rxStatsRow}>
                {rx.medicines.length > 0 && (
                  <Text style={styles.rxStatText}>
                    {rx.medicines.length} medicine{rx.medicines.length > 1 ? 's' : ''}
                  </Text>
                )}
                {rx.labTests.length > 0 && (
                  <Text style={styles.rxStatText}>
                    {rx.labTests.length} test{rx.labTests.length > 1 ? 's' : ''}
                  </Text>
                )}
              </View>

              <View style={styles.rxViewRow}>
                <Text style={styles.rxViewText}>View Prescription</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <ConsultTypeModal
        visible={showConsultModal}
        patientName={patientName}
        onClose={() => setShowConsultModal(false)}
        onSelectType={processAddToQueue}
        isLoading={isAddingToQueue}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.md,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backButton: { padding: SPACING.xs },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, flex: 1, textAlign: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  queueButton: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primarySurface, 
    paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.sm, gap: 4 
  },
  queueButtonText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  editButton: { padding: SPACING.xs },
  deleteButton: { padding: SPACING.xs },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: SPACING.xxxl },

  // Patient card
  patientCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg,
    marginBottom: SPACING.xl, ...SHADOWS.md,
  },
  patientCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: COLORS.white },
  patientInfo: { flex: 1 },
  patientName: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  patientMeta: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  patientDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  detailChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surfaceSecondary, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  detailChipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  allergyChip: { backgroundColor: COLORS.warningLight },
  allergyText: { color: COLORS.warning },

  // Section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textSecondary },
  sectionCount: { fontSize: 13, color: COLORS.textMuted },

  // Empty
  emptyContainer: {
    alignItems: 'center', paddingVertical: SPACING.xxxl,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
  },
  emptyText: { fontSize: 14, color: COLORS.textMuted, marginTop: SPACING.sm },

  // Prescription card
  rxCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: SPACING.lg,
    marginBottom: SPACING.sm, ...SHADOWS.sm,
  },
  rxCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  rxDateBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  rxDateText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  rxStatusBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.full },
  rxStatusText: { fontSize: 11, fontWeight: '700' },
  rxDiagnosis: { fontSize: 14, color: COLORS.textSecondary, marginBottom: SPACING.sm, lineHeight: 20 },
  rxStatsRow: { flexDirection: 'row', gap: SPACING.lg, marginBottom: SPACING.sm },
  rxStatText: { fontSize: 12, color: COLORS.textMuted },
  rxViewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: SPACING.xs },
  rxViewText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
});

