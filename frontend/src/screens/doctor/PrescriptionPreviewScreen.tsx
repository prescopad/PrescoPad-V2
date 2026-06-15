import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  useWindowDimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { APP_CONFIG } from '../../constants/config';
import { usePrescriptionStore } from '../../store/usePrescriptionStore';
import { useWalletStore } from '../../store/useWalletStore';
import { useClinicStore } from '../../store/useClinicStore';
import { useAuthStore } from '../../store/useAuthStore';
import { generatePrescriptionPDF } from '../../services/pdfService';
import { recordConsultationPayment } from '../../services/walletService';
import PrescriptionActions from '../../components/PrescriptionActions';
import SignatureModal from '../../components/SignatureModal';
import { hashPDF } from '../../services/cryptoService';
import { updateQueueStatus } from '../../services/dataService';
import { QueueStatus } from '../../types/queue.types';
import { DoctorStackParamList } from '../../types/navigation.types';
import { HEADER_PADDING_TOP } from '../../utils/responsive';

type Props = NativeStackScreenProps<DoctorStackParamList, 'PrescriptionPreview'>;

type PaymentMethod = 'cash' | 'online';

export default function PrescriptionPreviewScreen({ navigation, route }: Props): React.JSX.Element {
  const prescriptionId = route.params.prescriptionId;
  const readOnly = route.params.readOnly ?? false;
  const { width } = useWindowDimensions();
  const { currentPrescription, loadPrescription, finalizePrescription } = usePrescriptionStore();
  const { canAfford, loadBalance, balance } = useWalletStore();
  const { clinic, doctorProfile } = useClinicStore();
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  // Sign mode modal (shown BEFORE issuing)
  const [showSignModeModal, setShowSignModeModal] = useState(false);
  const [sigModalVisible, setSigModalVisible] = useState(false);

  // Payment modal state (shown AFTER issuing)
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [onlineAmount, setOnlineAmount] = useState('');
  // Issued prescription stored to pass to success screen after payment
  const issuedRxRef = useRef<typeof rx>(null);

  useEffect(() => {
    if (prescriptionId) {
      loadPrescription(prescriptionId);
    }
  }, [prescriptionId]);

  const rx = currentPrescription;

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Step 1: Doctor taps "Sign & Issue" → check wallet → show sign mode
  const handleSignAndIssue = async () => {
    if (!rx) return;

    await loadBalance();
    const affordable = canAfford();
    if (!affordable) {
      Alert.alert(
        'Insufficient Balance',
        `You need ${APP_CONFIG.wallet.currencySymbol}${APP_CONFIG.wallet.costPerPrescription} to issue a prescription. Current balance: ${APP_CONFIG.wallet.currencySymbol}${balance}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Recharge', onPress: () => navigation.getParent()?.navigate('DoctorWallet') },
        ],
      );
      return;
    }

    // Show sign mode selection — payment comes AFTER issuing
    setShowSignModeModal(true);
  };

  const handleSignModeSelect = (mode: 'saved' | 'draw') => {
    setShowSignModeModal(false);
    if (mode === 'saved' && doctorProfile?.signatureBase64) {
      signAndIssueWithSignature(doctorProfile.signatureBase64, false);
    } else {
      setSigModalVisible(true);
    }
  };

  // Step 2: Sign and issue the prescription, then show payment modal
  const signAndIssueWithSignature = async (signature: string, save: boolean) => {
    if (!rx) return;
    setIsSigning(true);
    try {
      const rxForPdf = { ...rx, signature };
      const pdfPath = await generatePrescriptionPDF(rxForPdf, clinic, doctorProfile);
      const pdfHash = await hashPDF(pdfPath);
      await finalizePrescription(rx.id, signature, pdfPath, pdfHash);

      if (save) {
        await useClinicStore.getState().updateDoctorProfile({ signatureBase64: signature });
      }

      const queueItemId = usePrescriptionStore.getState().queueItemId;
      if (queueItemId) {
        updateQueueStatus(queueItemId, QueueStatus.COMPLETED).catch(() => {});
      }

      await loadBalance();

      // Store the issued Rx so we can navigate after payment is recorded
      issuedRxRef.current = usePrescriptionStore.getState().currentPrescription ?? rx;

      // Step 3: Now ask for payment method
      setCashAmount('');
      setOnlineAmount('');
      setSelectedPayment(null);
      setShowPaymentModal(true);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to issue prescription';
      Alert.alert('Error', msg);
    } finally {
      setIsSigning(false);
    }
  };

  // Step 3a: Cash selected — doctor enters amount received, then proceed
  const handleCashDone = () => {
    const issued = issuedRxRef.current ?? rx!;
    const amount = parseFloat(cashAmount);
    if (amount > 0) {
      recordConsultationPayment(issued.id, amount, 'cash').catch(() => {});
    }
    setShowPaymentModal(false);
    navigation.replace('RxSuccess', { prescription: issued });
  };

  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);

  // Step 3b: Online selected — show QR, then proceed
  const handlePaymentSelected = (method: PaymentMethod) => {
    setSelectedPayment(method);
    if (method === 'online') {
      setShowPaymentModal(false);
      setShowQRModal(true);
    }
    // cash: stay in modal to show amount input
  };

  const handleQRDone = () => {
    const issued = issuedRxRef.current ?? rx!;
    const amount = parseFloat(onlineAmount);
    if (amount > 0) {
      recordConsultationPayment(issued.id, amount, 'online').catch(() => {});
    }
    setShowQRModal(false);
    navigation.replace('RxSuccess', { prescription: issued });
  };

  if (!rx) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading prescription...</Text>
      </View>
    );
  }

  const hasSavedSignature = !!doctorProfile?.signatureBase64;
  const hasQR = !!doctorProfile?.signatureBase64; // reuse signatureBase64 field check; QR would be a separate field ideally

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Prescription Preview</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: readOnly ? SPACING.xxxl : 100 }]}>
        {/* Prescription Paper */}
        <View style={[styles.paper, { padding: width < 360 ? SPACING.md : SPACING.xl }]}>
          {/* Clinic Header */}
          <View style={styles.clinicHeader}>
            <Text style={styles.clinicName}>{clinic?.name || 'PrescoPad Clinic'}</Text>
            {clinic?.address ? (
              <Text style={styles.clinicInfo}>{clinic.address}</Text>
            ) : null}
            {(clinic?.phone || clinic?.email) ? (
              <Text style={styles.clinicInfo}>
                {[clinic?.phone, clinic?.email].filter(Boolean).join(' | ')}
              </Text>
            ) : null}
            <Text style={styles.doctorInfo}>
              Dr. {doctorProfile?.name || 'Doctor'}
              {doctorProfile?.specialty ? ` | ${doctorProfile.specialty}` : ''}
              {doctorProfile?.regNumber ? ` | Reg: ${doctorProfile.regNumber}` : ''}
            </Text>
          </View>

          {/* Date row (Rx symbol removed) */}
          <View style={styles.dateRow}>
            <Text style={styles.rxDate}>Date: {formatDate(rx.createdAt)}</Text>
            <Text style={styles.rxId}>ID: {rx.id}</Text>
          </View>

          {/* Patient Details */}
          <View style={styles.patientSection}>
            <View style={styles.patientField}>
              <Text style={styles.patientLabel}>PATIENT</Text>
              <Text style={styles.patientValue}>{rx.patientName}</Text>
            </View>
            <View style={styles.patientField}>
              <Text style={styles.patientLabel}>AGE / GENDER</Text>
              <Text style={styles.patientValue}>{rx.patientAge} yrs / {rx.patientGender}</Text>
            </View>
            <View style={styles.patientField}>
              <Text style={styles.patientLabel}>PHONE</Text>
              <Text style={styles.patientValue}>{rx.patientPhone || 'N/A'}</Text>
            </View>
          </View>

          {/* Symptoms */}
          {rx.symptoms && rx.symptoms.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SYMPTOMS</Text>
              <View style={styles.diagnosisBox}>
                <Text style={styles.diagnosisText}>{rx.symptoms.join(', ')}</Text>
              </View>
            </View>
          ) : null}

          {/* Diagnosis */}
          {rx.diagnosis ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DIAGNOSIS</Text>
              <View style={styles.diagnosisBox}>
                <Text style={styles.diagnosisText}>{rx.diagnosis}</Text>
              </View>
            </View>
          ) : null}

          {/* Medicines Table */}
          {rx.medicines.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>MEDICINES</Text>
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderCell, styles.colNum]}>#</Text>
                  <Text style={[styles.tableHeaderCell, styles.colName]}>Name</Text>
                  <Text style={[styles.tableHeaderCell, styles.colDosage]}>Dosage</Text>
                  <Text style={[styles.tableHeaderCell, styles.colDuration]}>Duration</Text>
                  <Text style={[styles.tableHeaderCell, styles.colTiming]}>Timing</Text>
                </View>
                {rx.medicines.map((med, index) => (
                  <View key={med.id || index} style={styles.tableRow}>
                    <Text style={[styles.tableCell, styles.colNum]}>{index + 1}</Text>
                    <View style={styles.colName}>
                      <Text style={styles.medName}>{med.medicineName}</Text>
                      <Text style={styles.medType}>{med.type}</Text>
                    </View>
                    <Text style={[styles.tableCell, styles.colDosage]}>{med.frequency}</Text>
                    <Text style={[styles.tableCell, styles.colDuration]}>{med.duration}</Text>
                    <Text style={[styles.tableCell, styles.colTiming]}>{med.timing}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Lab Tests */}
          {rx.labTests.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>LAB TESTS / INVESTIGATIONS</Text>
              {rx.labTests.map((test, index) => (
                <View key={test.id || index} style={styles.labTestRow}>
                  <Ionicons name="flask-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.labTestText}>
                    {test.testName}
                    {test.notes ? ` - ${test.notes}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Advice */}
          {rx.advice ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ADVICE</Text>
              <View style={styles.adviceBox}>
                <Ionicons name="information-circle-outline" size={18} color={COLORS.warning} />
                <Text style={styles.adviceText}>{rx.advice}</Text>
              </View>
            </View>
          ) : null}

          {/* Follow-up */}
          {rx.followUpDate ? (
            <View style={styles.followUpRow}>
              <Ionicons name="calendar-outline" size={18} color={COLORS.error} />
              <Text style={styles.followUpText}>
                Follow-up: {formatDate(rx.followUpDate)}
              </Text>
            </View>
          ) : null}

          {/* Signature Area */}
          <View style={styles.signatureSection}>
            {rx.signature && rx.signature.startsWith('M') ? (
              <View style={styles.signatureImgContainer}>
                <Svg width={150} height={50} viewBox="0 0 300 100">
                  <Path
                    d={rx.signature}
                    stroke={COLORS.text}
                    strokeWidth={4.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>
            ) : rx.signature ? (
              <Image source={{ uri: rx.signature }} style={styles.signatureImg} resizeMode="contain" />
            ) : null}
            <View style={styles.signatureLine}>
              <Text style={styles.signatureDoctorName}>Dr. {doctorProfile?.name || 'Doctor'}</Text>
              {doctorProfile?.regNumber ? (
                <Text style={styles.signatureReg}>Reg. No: {doctorProfile.regNumber}</Text>
              ) : null}
            </View>
          </View>

          {/* Footer */}
          <View style={styles.paperFooter}>
            <Text style={styles.footerText}>Generated by PrescoPad - Digital Prescription System</Text>
          </View>
        </View>

        {/* Share / Download / Print — only for issued prescriptions */}
        {rx?.status === 'finalized' && (
          <PrescriptionActions prescription={rx} />
        )}
      </ScrollView>

      {/* Sign & Issue Button — hidden in read-only mode */}
      {!readOnly && (
        <View style={styles.bottomBar}>
          <View style={styles.costInfo}>
            <Ionicons name="wallet-outline" size={18} color={COLORS.textMuted} />
            <Text style={styles.costText}>
              Cost: {APP_CONFIG.wallet.currencySymbol}{APP_CONFIG.wallet.costPerPrescription}
            </Text>
            <Text style={styles.balanceText}>
              Balance: {APP_CONFIG.wallet.currencySymbol}{balance}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.signButton, isSigning && styles.buttonDisabled]}
            onPress={handleSignAndIssue}
            disabled={isSigning}
            activeOpacity={0.8}
          >
            {isSigning ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />
                <Text style={styles.signButtonText}>Sign & Issue</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Payment Method Modal */}
      <Modal
        visible={showPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Payment</Text>
              <TouchableOpacity onPress={() => {
                Alert.alert(
                  'Skip Payment?',
                  'No payment will be recorded for this consultation.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Skip',
                      style: 'destructive',
                      onPress: () => {
                        setShowPaymentModal(false);
                        navigation.replace('RxSuccess', { prescription: issuedRxRef.current ?? rx! });
                      },
                    },
                  ]
                );
              }}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Prescription issued successfully. How did the patient pay?</Text>

            {/* Payment options */}
            <TouchableOpacity
              style={[styles.paymentOption, selectedPayment === 'cash' && styles.paymentOptionSelected]}
              onPress={() => handlePaymentSelected('cash')}
              activeOpacity={0.7}
            >
              <View style={[styles.paymentIconCircle, { backgroundColor: COLORS.successLight }]}>
                <Ionicons name="cash-outline" size={28} color={COLORS.success} />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentTitle}>Cash</Text>
                <Text style={styles.paymentSubtitle}>Patient pays in cash</Text>
              </View>
              {selectedPayment === 'cash'
                ? <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                : <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
              }
            </TouchableOpacity>

            {/* Cash amount input — shown when Cash is selected */}
            {selectedPayment === 'cash' && (
              <View style={styles.cashAmountContainer}>
                <Text style={styles.cashAmountLabel}>Amount Received (₹)</Text>
                <TextInput
                  style={styles.cashAmountInput}
                  placeholder="Enter amount e.g. 500"
                  placeholderTextColor={COLORS.textLight}
                  value={cashAmount}
                  onChangeText={setCashAmount}
                  keyboardType="numeric"
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.cashConfirmButton}
                  onPress={handleCashDone}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.white} />
                  <Text style={styles.cashConfirmText}>Confirm & Continue</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.paymentOption, selectedPayment === 'online' && styles.paymentOptionSelected]}
              onPress={() => handlePaymentSelected('online')}
              activeOpacity={0.7}
            >
              <View style={[styles.paymentIconCircle, { backgroundColor: COLORS.primarySurface }]}>
                <Ionicons name="qr-code-outline" size={28} color={COLORS.primary} />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentTitle}>Online / UPI</Text>
                <Text style={styles.paymentSubtitle}>Show QR code for payment</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* QR Code Modal */}
      <Modal
        visible={showQRModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQRModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Scan to Pay</Text>
              <TouchableOpacity onPress={() => setShowQRModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.qrContainer}>
              {doctorProfile?.signatureBase64 ? (
                <Image
                  source={{ uri: doctorProfile.signatureBase64 }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.qrPlaceholder}>
                  <Ionicons name="qr-code-outline" size={80} color={COLORS.textLight} />
                  <Text style={styles.qrPlaceholderText}>No QR uploaded</Text>
                  <Text style={styles.qrHint}>Upload your payment QR in Settings → Clinic Profile</Text>
                </View>
              )}
            </View>

            <Text style={styles.qrInstructions}>
              Ask the patient to scan this QR code and complete payment
            </Text>

            <View style={styles.cashAmountContainer}>
              <Text style={styles.cashAmountLabel}>Amount Received (₹)</Text>
              <TextInput
                style={styles.cashAmountInput}
                placeholder="Enter amount e.g. 500"
                placeholderTextColor={COLORS.textLight}
                value={onlineAmount}
                onChangeText={setOnlineAmount}
                keyboardType="numeric"
              />
            </View>

            <TouchableOpacity
              style={styles.qrDoneButton}
              onPress={handleQRDone}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.white} />
              <Text style={styles.qrDoneText}>Payment Received — Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sign Mode Selection Modal */}
      <Modal
        visible={showSignModeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSignModeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Signature</Text>
              <TouchableOpacity onPress={() => setShowSignModeModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Select how you want to sign this prescription</Text>

            {hasSavedSignature && (
              <TouchableOpacity
                style={styles.signOption}
                onPress={() => handleSignModeSelect('saved')}
                activeOpacity={0.7}
              >
                <View style={[styles.paymentIconCircle, { backgroundColor: COLORS.primarySurface }]}>
                  <Ionicons name="checkmark-done-outline" size={24} color={COLORS.primary} />
                </View>
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentTitle}>Use Saved Signature</Text>
                  <Text style={styles.paymentSubtitle}>Use the signature from your profile</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.signOption}
              onPress={() => handleSignModeSelect('draw')}
              activeOpacity={0.7}
            >
              <View style={[styles.paymentIconCircle, { backgroundColor: COLORS.warningLight }]}>
                <Ionicons name="create-outline" size={24} color={COLORS.warning} />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentTitle}>Draw Signature</Text>
                <Text style={styles.paymentSubtitle}>Draw your signature with your finger</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Signature Modal */}
      <SignatureModal
        visible={sigModalVisible}
        onClose={() => setSigModalVisible(false)}
        onConfirm={(signature, save) => {
          setSigModalVisible(false);
          signAndIssueWithSignature(signature, save);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: HEADER_PADDING_TOP,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerSpacer: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
  },

  // Paper styling
  paper: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.lg,
  },
  clinicHeader: {
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: COLORS.primary,
    paddingBottom: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  clinicName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  clinicInfo: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  doctorInfo: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    fontWeight: '600',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  rxDate: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  rxId: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Patient section
  patientSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  patientField: {
    flex: 1,
    minWidth: 80,
  },
  patientLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  patientValue: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
  },

  // Sections
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  diagnosisBox: {
    backgroundColor: COLORS.primarySurface,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopRightRadius: RADIUS.sm,
    borderBottomRightRadius: RADIUS.sm,
  },
  diagnosisText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  // Medicines table
  table: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  tableHeaderCell: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.white,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    alignItems: 'center',
  },
  tableCell: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  colNum: {
    width: 24,
    textAlign: 'center',
  },
  colName: {
    flex: 2,
    paddingHorizontal: SPACING.xs,
  },
  colDosage: {
    flex: 1.2,
    paddingHorizontal: SPACING.xs,
  },
  colDuration: {
    flex: 1,
    paddingHorizontal: SPACING.xs,
  },
  colTiming: {
    flex: 1,
    paddingHorizontal: SPACING.xs,
  },
  medName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  medType: {
    fontSize: 10,
    color: COLORS.textMuted,
  },

  // Lab tests
  labTestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
  },
  labTestText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },

  // Advice
  adviceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.warningLight,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopRightRadius: RADIUS.sm,
    borderBottomRightRadius: RADIUS.sm,
    gap: SPACING.sm,
  },
  adviceText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 18,
  },

  // Follow-up
  followUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  followUpText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.error,
  },

  // Signature
  signatureSection: {
    marginTop: SPACING.xxxl,
    alignItems: 'flex-end',
  },
  signatureImgContainer: {
    width: 150,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  signatureImg: {
    width: 150,
    height: 50,
    marginBottom: 4,
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: COLORS.textSecondary,
    width: 180,
    paddingTop: SPACING.xs,
    alignItems: 'center',
  },
  signatureDoctorName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  signatureReg: {
    fontSize: 10,
    color: COLORS.textMuted,
  },

  // Paper footer
  paperFooter: {
    marginTop: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 9,
    color: COLORS.textLight,
  },

  // Bottom bar
  bottomBar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    ...SHADOWS.lg,
  },
  costInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  costText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  balanceText: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '600',
    marginLeft: SPACING.sm,
  },
  signButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.success,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    ...SHADOWS.md,
  },
  signButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl,
    paddingBottom: SPACING.xxxl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: SPACING.xl,
  },

  // Payment options
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  paymentOptionSelected: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.successLight,
  },
  cashAmountContainer: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  cashAmountLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cashAmountInput: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  cashConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.success,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    gap: SPACING.sm,
  },
  cashConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
  paymentIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentInfo: {
    flex: 1,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  paymentSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // QR
  qrContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.lg,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  qrPlaceholder: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  qrPlaceholderText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  qrHint: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
  qrInstructions: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 19,
  },
  qrDoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.success,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    gap: SPACING.sm,
    ...SHADOWS.md,
  },
  qrDoneText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Sign options
  signOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
});
