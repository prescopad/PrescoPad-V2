import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { usePrescriptionStore } from '../../store/usePrescriptionStore';
import { useAuthStore } from '../../store/useAuthStore';
import { usePatientStore } from '../../store/usePatientStore';
import { PrescriptionMedicine, PrescriptionLabTest } from '../../types/prescription.types';
import { AssistantModal } from '../../components/AssistantModal';
import { DoctorStackParamList } from '../../types/navigation.types';
import { KEYBOARD_VERTICAL_OFFSET } from '../../utils/responsive';

type MedicineDraft = Omit<PrescriptionMedicine, 'id' | 'prescriptionId'>;
type LabTestDraft = Omit<PrescriptionLabTest, 'id' | 'prescriptionId'>;

type ConsultScreenProps = NativeStackScreenProps<DoctorStackParamList, 'Consult'>;

const COMMON_SYMPTOMS = [
  'Abdominal Pain', 'Anxiety', 'Back Pain', 'Blurred Vision', 'Body Pain',
  'Burning Urination', 'Chest Pain', 'Cold & Cough', 'Constipation', 'Diarrhea',
  'Dizziness', 'Ear Pain', 'Eye Redness', 'Fatigue', 'Fever',
  'Headache', 'Insomnia', 'Itching', 'Joint Pain', 'Loss of Appetite',
  'Nausea', 'Palpitations', 'Runny Nose', 'Shortness of Breath', 'Skin Rash',
  'Sore Throat', 'Swelling', 'Toothache', 'Vomiting', 'Weakness',
] as const;

export default function ConsultScreen({ navigation, route }: ConsultScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { queueItem, patient: initialPatient } = route.params;
  const user = useAuthStore((s) => s.user);
  const getPatientById = usePatientStore((s) => s.getPatientById);

  const {
    currentDraft,
    updateDraft,
    removeMedicine,
    removeLabTest,
    createPrescription,
    resetDraft,
    setQueueItemId,
    isLoading,
  } = usePrescriptionStore();

  const [isCreating, setIsCreating] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSymptomsModal, setShowSymptomsModal] = useState(false);
  const [customSymptom, setCustomSymptom] = useState('');
  // Live patient data for real-time updates
  const [patient, setPatient] = useState(initialPatient);

  // Reset draft only when navigating back (not forward to PrescriptionPreview)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (e.data.action.type === 'GO_BACK') {
        resetDraft();
      }
    });
    return unsubscribe;
  }, [navigation, resetDraft]);

  useEffect(() => {
    setQueueItemId(queueItem.id);
    const pid = initialPatient?.id || queueItem.patientId;
    updateDraft({
      patientId: pid,
      patientName: initialPatient?.name || 'Unknown',
      patientAge: initialPatient?.age?.toString() || '',
      patientGender: initialPatient?.gender || '',
      patientWeight: initialPatient?.weight?.toString() || '',
      patientPhone: initialPatient?.phone || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload patient when screen comes back into focus (after editing)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      const pid = initialPatient?.id || queueItem.patientId;
      if (!pid) return;
      try {
        const freshPatient = await getPatientById(pid);
        if (freshPatient) {
          setPatient(freshPatient);
          updateDraft({
            patientName: freshPatient.name,
            patientAge: freshPatient.age?.toString() || '',
            patientGender: freshPatient.gender || '',
            patientWeight: freshPatient.weight?.toString() || '',
            patientPhone: freshPatient.phone || '',
          });
        }
      } catch {
        // Silently handle
      }
    });
    return unsubscribe;
  }, [navigation, initialPatient, queueItem, getPatientById, updateDraft]);

  const handleAdviceChange = (text: string) => updateDraft({ advice: text });

  const parseFollowUpToDate = (s: string): Date => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ddmmyyyy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ddmmyyyy) {
      const [, dd, mm, yyyy] = ddmmyyyy;
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      if (!isNaN(d.getTime())) return d;
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      const [, yyyy, mm, dd] = iso;
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      if (!isNaN(d.getTime())) return d;
    }
    return today;
  };

  const formatDateISO = (d: Date): string => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleDatePicked = (event: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (event.type === 'dismissed' || !selected) return;
    updateDraft({ followUpDate: formatDateISO(selected) });
  };

  const todayAtMidnight = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();

  const handleAddMedicine = () => navigation.navigate('MedicinePicker');
  const handleAddLabTest = () => navigation.navigate('LabTestPicker');

  const handleRemoveMedicine = (index: number) => {
    Alert.alert(
      'Remove Medicine',
      `Remove ${currentDraft.medicines[index]?.medicineName}?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeMedicine(index) },
      ]
    );
  };

  const handleRemoveLabTest = (index: number) => {
    Alert.alert(
      'Remove Lab Test',
      `Remove ${currentDraft.labTests[index]?.testName}?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeLabTest(index) },
      ]
    );
  };

  const toggleSymptom = (symptom: string) => {
    const current = currentDraft.symptoms || [];
    const next = current.includes(symptom)
      ? current.filter((s) => s !== symptom)
      : [...current, symptom];
    updateDraft({ symptoms: next });
  };

  const addCustomSymptom = () => {
    const trimmed = customSymptom.trim();
    if (!trimmed) return;
    const current = currentDraft.symptoms || [];
    if (!current.includes(trimmed)) {
      updateDraft({ symptoms: [...current, trimmed] });
    }
    setCustomSymptom('');
  };

  const removeSymptom = (symptom: string) => {
    const current = currentDraft.symptoms || [];
    updateDraft({ symptoms: current.filter((s) => s !== symptom) });
  };

  const handlePreview = async () => {
    const symptoms = currentDraft.symptoms || [];
    if (symptoms.length === 0 && !currentDraft.diagnosis) {
      Alert.alert(t('common.required'), 'Please select at least one symptom.');
      return;
    }
    if (currentDraft.medicines.length === 0 && currentDraft.labTests.length === 0) {
      Alert.alert('Empty Prescription', t('consult.needMedOrTest'));
      return;
    }
    if (!user?.id) {
      Alert.alert(t('common.error'), 'Doctor session not found. Please re-login.');
      return;
    }

    setIsCreating(true);
    try {
      const prescription = await createPrescription(user.id);
      navigation.navigate('PrescriptionPreview', { prescriptionId: prescription.id });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create prescription';
      Alert.alert(t('common.error'), message);
    } finally {
      setIsCreating(false);
    }
  };

  const patientGenderDisplay = patient?.gender
    ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)
    : '--';

  const selectedSymptoms = currentDraft.symptoms || [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />
      {/* Custom header replaces native RN header to avoid double-bar on Android */}
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.navBackBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navHeaderTitle}>{t('nav.consultation')}</Text>
        <View style={styles.navHeaderSpacer} />
      </View>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={KEYBOARD_VERTICAL_OFFSET}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: width < 360 ? SPACING.md : SPACING.lg }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Patient Info Card */}
          <View style={styles.patientCard}>
            <View style={styles.patientIconRow}>
              <View style={styles.patientIcon}>
                <Ionicons name="person" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.patientDetails}>
                <Text style={styles.patientName}>{patient?.name || 'Unknown Patient'}</Text>
                <Text style={styles.patientMeta}>
                  {patient?.age || '--'} yrs | {patientGenderDisplay} | {patient?.phone || '--'}
                </Text>
                {patient?.weight ? (
                  <Text style={styles.patientMeta}>Weight: {patient.weight} kg</Text>
                ) : null}
                {patient?.allergies && !['no', 'none', 'n/a', 'nil', '-', 'nill'].includes(patient.allergies.toLowerCase().trim()) ? (
                  <View style={styles.allergyBadge}>
                    <Ionicons name="warning" size={12} color={COLORS.error} />
                    <Text style={styles.allergyText}>Allergies: {patient.allergies}</Text>
                  </View>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.editPatientButton}
                onPress={() => patient && navigation.navigate('EditPatient', { patientId: patient.id })}
              >
                <Ionicons name="create-outline" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Symptoms Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionLabelRow}>
                <Text style={styles.sectionTitle}>Symptoms *</Text>
              </View>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowSymptomsModal(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={18} color={COLORS.white} />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>

            {selectedSymptoms.length === 0 ? (
              <TouchableOpacity
                style={styles.emptySection}
                onPress={() => setShowSymptomsModal(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="list-outline" size={24} color={COLORS.textLight} />
                <Text style={styles.emptyText}>Tap to add symptoms</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.selectedSymptomsContainer}>
                {selectedSymptoms.map((symptom) => (
                  <View key={symptom} style={styles.selectedSymptomChip}>
                    <Text style={styles.selectedSymptomText}>{symptom}</Text>
                    <TouchableOpacity
                      onPress={() => removeSymptom(symptom)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={16} color={COLORS.white} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.addMoreChip}
                  onPress={() => setShowSymptomsModal(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={16} color={COLORS.primary} />
                  <Text style={styles.addMoreChipText}>More</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Medicines */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionLabelRow}>
                <Text style={styles.sectionTitle}>
                  {t('consult.medicines')} ({currentDraft.medicines.length})
                </Text>
              </View>
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddMedicine}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={18} color={COLORS.white} />
                <Text style={styles.addButtonText}>{t('common.add')}</Text>
              </TouchableOpacity>
            </View>

            {currentDraft.medicines.length === 0 ? (
              <TouchableOpacity
                style={styles.emptySection}
                onPress={handleAddMedicine}
                activeOpacity={0.7}
              >
                <Ionicons name="medical-outline" size={24} color={COLORS.textLight} />
                <Text style={styles.emptyText}>Tap to add medicines</Text>
              </TouchableOpacity>
            ) : (
              currentDraft.medicines.map((med: MedicineDraft, index: number) => (
                <View key={`med-${index}`} style={styles.itemCard}>
                  <View style={styles.itemContent}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemName} numberOfLines={2}>{med.medicineName}</Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveMedicine(index)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="close-circle" size={22} color={COLORS.error} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.itemDetail}>
                      {med.type}{med.dosage ? ` - ${med.dosage}` : ''}
                    </Text>
                    <Text style={styles.itemDetail}>
                      {med.frequency} | {med.duration} | {med.timing}
                    </Text>
                    {med.notes ? (
                      <Text style={styles.itemNotes}>{med.notes}</Text>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Lab Tests */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionLabelRow}>
                <Text style={styles.sectionTitle}>
                  {t('consult.labTests')} ({currentDraft.labTests.length})
                </Text>
              </View>
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddLabTest}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={18} color={COLORS.white} />
                <Text style={styles.addButtonText}>{t('common.add')}</Text>
              </TouchableOpacity>
            </View>

            {currentDraft.labTests.length === 0 ? (
              <TouchableOpacity
                style={styles.emptySection}
                onPress={handleAddLabTest}
                activeOpacity={0.7}
              >
                <Ionicons name="flask-outline" size={24} color={COLORS.textLight} />
                <Text style={styles.emptyText}>Tap to add lab tests</Text>
              </TouchableOpacity>
            ) : (
              currentDraft.labTests.map((test: LabTestDraft, index: number) => (
                <View key={`test-${index}`} style={styles.itemCard}>
                  <View style={styles.itemContent}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemName} numberOfLines={2}>{test.testName}</Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveLabTest(index)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="close-circle" size={22} color={COLORS.error} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.itemDetail}>{test.category}</Text>
                    {test.notes ? (
                      <Text style={styles.itemNotes}>{test.notes}</Text>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Additional Advice */}
          <View style={styles.section}>
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionTitle}>Additional Advice</Text>
            </View>
            <TextInput
              style={styles.adviceInput}
              placeholder="Any additional advice for the patient..."
              placeholderTextColor={COLORS.textLight}
              value={currentDraft.advice}
              onChangeText={handleAdviceChange}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />
          </View>

          {/* Follow-up Date */}
          <View style={styles.section}>
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionTitle}>{t('consult.followUp')}</Text>
            </View>
            <TouchableOpacity
              style={styles.followUpRow}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={20} color={COLORS.textMuted} />
              <Text style={[styles.followUpInput, !currentDraft.followUpDate && { color: COLORS.textLight }]}>
                {currentDraft.followUpDate || t('consult.pickDate')}
              </Text>
              {currentDraft.followUpDate ? (
                <TouchableOpacity onPress={() => updateDraft({ followUpDate: '' })} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={parseFollowUpToDate(currentDraft.followUpDate)}
                mode="date"
                minimumDate={todayAtMidnight}
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={handleDatePicked}
              />
            )}
          </View>

          {/* Spacer for bottom button */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Preview Button */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[
              styles.previewButton,
              (isCreating || isLoading) && styles.previewButtonDisabled,
            ]}
            onPress={handlePreview}
            activeOpacity={0.8}
            disabled={isCreating || isLoading}
          >
            {isCreating || isLoading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Ionicons name="document-text" size={20} color={COLORS.white} />
                <Text style={styles.previewButtonText}>{t('consult.preview')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Symptoms Selection Modal */}
        <Modal
          visible={showSymptomsModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowSymptomsModal(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={KEYBOARD_VERTICAL_OFFSET}
          >
            <View style={styles.modalSheet}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Symptoms</Text>
                <TouchableOpacity onPress={() => setShowSymptomsModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              {/* Selected count */}
              <View style={[styles.selectedCountRow, { opacity: selectedSymptoms.length > 0 ? 1 : 0 }]}>
                <Text style={styles.selectedCountText}>
                  {selectedSymptoms.length} selected
                </Text>
              </View>

              <ScrollView
                style={styles.modalScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Common and custom symptoms grid */}
                <View style={styles.symptomsGrid}>
                  {[...COMMON_SYMPTOMS, ...selectedSymptoms.filter(s => !COMMON_SYMPTOMS.includes(s as any))].map((symptom) => {
                    const isSelected = selectedSymptoms.includes(symptom);
                    return (
                      <TouchableOpacity
                        key={symptom}
                        style={[styles.symptomGridItem, isSelected && styles.symptomGridItemSelected]}
                        onPress={() => toggleSymptom(symptom)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.symptomCheckIcon}>
                          {isSelected ? (
                            <Ionicons name="checkmark" size={13} color={COLORS.white} />
                          ) : (
                            <View style={styles.symptomCheckPlaceholder} />
                          )}
                        </View>
                        <Text style={[styles.symptomGridText, isSelected && styles.symptomGridTextSelected]}>
                          {symptom}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Add custom symptom */}
                <View style={styles.customSymptomRow}>
                  <TextInput
                    style={styles.customSymptomInput}
                    placeholder="Type custom symptom..."
                    placeholderTextColor={COLORS.textLight}
                    value={customSymptom}
                    onChangeText={setCustomSymptom}
                    onSubmitEditing={addCustomSymptom}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={styles.customSymptomAdd}
                    onPress={addCustomSymptom}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={22} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
              </ScrollView>

              <TouchableOpacity
                style={styles.modalDoneButton}
                onPress={() => setShowSymptomsModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalDoneButtonText}>Done ({selectedSymptoms.length})</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  navBackBtn: {
    padding: SPACING.xs,
  },
  navHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  navHeaderSpacer: {
    width: 32,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 20,
  },

  // Patient Card
  patientCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.sm,
  },
  patientIconRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  patientIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  patientDetails: {
    flex: 1,
  },
  editPatientButton: {
    padding: SPACING.sm,
    marginLeft: SPACING.sm,
  },
  patientName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  patientMeta: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  allergyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.errorLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    marginTop: SPACING.sm,
    gap: 4,
    alignSelf: 'flex-start',
  },
  allergyText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.error,
  },

  // Sections
  section: {
    marginBottom: SPACING.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },

  // Symptoms
  selectedSymptomsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  selectedSymptomChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    gap: SPACING.xs,
  },
  selectedSymptomText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  addMoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primarySurface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    gap: 2,
  },
  addMoreChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Inputs
  adviceInput: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 60,
  },
  followUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  followUpInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: SPACING.md,
  },

  // Add Button
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    gap: 4,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },

  // Empty Section
  emptySection: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },

  // Item Cards (Medicines / Lab Tests)
  itemCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  itemDetail: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  itemNotes: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: SPACING.xs,
  },

  // Bottom Bar
  bottomBar: {
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
    paddingBottom: SPACING.lg + (Platform.OS === 'android' ? 8 : 0),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    ...SHADOWS.lg,
  },
  previewButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    ...SHADOWS.md,
  },
  previewButtonDisabled: {
    opacity: 0.6,
  },
  previewButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Symptoms Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
    maxHeight: '90%',
    minHeight: '60%',
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  selectedCountRow: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primarySurface,
  },
  selectedCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  symptomsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  symptomGridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    // Fixed min-width prevents layout shift when checkmark appears/disappears
    minWidth: 80,
  },
  symptomGridItemSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  symptomCheckIcon: {
    width: 16,
    height: 16,
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symptomCheckPlaceholder: {
    width: 13,
    height: 13,
  },
  symptomGridText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  symptomGridTextSelected: {
    color: COLORS.white,
  },
  customSymptomRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    gap: SPACING.sm,
    alignItems: 'center',
  },
  customSymptomInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 14,
    color: COLORS.text,
  },
  customSymptomAdd: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDoneButton: {
    backgroundColor: COLORS.primary,
    marginHorizontal: SPACING.xl,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: 'center',
    ...SHADOWS.md,
  },
  modalDoneButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
});
