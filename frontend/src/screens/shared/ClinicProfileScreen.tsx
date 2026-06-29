import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ParamListBase } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import SecureStore from '../../utils/secureStore';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { useClinicStore } from '../../store/useClinicStore';
import { useAuthStore } from '../../store/useAuthStore';
import { uploadImageToCloudinary } from '../../services/cloudinaryService';
import { updateProfile as updateAuthProfile } from '../../services/authService';
import { HEADER_PADDING_TOP, KEYBOARD_VERTICAL_OFFSET } from '../../utils/responsive';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';

const SIG_FILE_URI = `${FileSystem.documentDirectory}doctor_signature.svg`;

interface ClinicProfileScreenProps {
  navigation: NativeStackNavigationProp<ParamListBase>;
}

export default function ClinicProfileScreen({ navigation }: ClinicProfileScreenProps): React.JSX.Element {
  const keyboardHeight = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const {
    clinic,
    doctorProfile,
    loadClinic,
    loadDoctorProfile,
    updateClinic,
    updateDoctorProfile,
    isLoading,
  } = useClinicStore();

  const { user } = useAuthStore();
  const canEdit = user?.role === 'doctor' || user?.role === 'admin';
  const { t } = useTranslation();

  const [clinicName, setClinicName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Digital signature (Cloudinary URL or SVG coordinates)
  const [signatureUrl, setSignatureUrl] = useState<string>(doctorProfile?.signatureBase64 || '');
  const [isUploadingSig, setIsUploadingSig] = useState(false);

  // Clinic QR Code URL
  const [qrCodeUrl, setQrCodeUrl] = useState<string>(clinic?.qrCodeUrl || '');
  const [isUploadingQr, setIsUploadingQr] = useState(false);

  useEffect(() => {
    setSignatureUrl(doctorProfile?.signatureBase64 || '');
  }, [doctorProfile?.signatureBase64]);

  const handlePickSignature = async () => {
    if (!canEdit) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('common.error'), t('signature.permission'));
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 1],
        quality: 0.9,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;

      setIsUploadingSig(true);
      const uploaded = await uploadImageToCloudinary(picked.assets[0].uri, {
        filename: `sig_${user?.id || 'doctor'}.jpg`,
      });
      // Persist on backend.
      const updatedUser = await updateAuthProfile({ signatureUrl: uploaded.secure_url });
      // Mirror into auth store so PDFs pick it up immediately.
      const auth = useAuthStore.getState();
      if (auth.accessToken && auth.refreshToken) {
        await auth.setUser(updatedUser, auth.accessToken, auth.refreshToken);
      }
      
      // Clear local drawn signature cache so the new uploaded image is used
      await SecureStore.deleteItemAsync('doctorSignature');
      try {
        await FileSystem.deleteAsync(SIG_FILE_URI, { idempotent: true });
      } catch {}

      // Update doctorProfile in store
      useClinicStore.getState().setDoctorProfile({
        ...doctorProfile!,
        signatureBase64: uploaded.secure_url,
      });

      setSignatureUrl(uploaded.secure_url);
      Alert.alert(t('common.success'), t('signature.saved'));
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('signature.uploadFailed'));
    } finally {
      setIsUploadingSig(false);
    }
  };

  const handleRemoveSignature = async () => {
    if (!canEdit) return;
    Alert.alert(t('signature.removeTitle'), t('signature.removeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const updatedUser = await updateAuthProfile({ signatureUrl: '' });
            const auth = useAuthStore.getState();
            if (auth.accessToken && auth.refreshToken) {
              await auth.setUser(updatedUser, auth.accessToken, auth.refreshToken);
            }
            
            // Clear local signature files and store cache
            await SecureStore.deleteItemAsync('doctorSignature');
            try {
              await FileSystem.deleteAsync(SIG_FILE_URI, { idempotent: true });
            } catch {}

            // Update doctorProfile in store
            useClinicStore.getState().setDoctorProfile({
              ...doctorProfile!,
              signatureBase64: null,
            });

            setSignatureUrl('');
          } catch (e) {
            Alert.alert(t('common.error'), e instanceof Error ? e.message : t('common.somethingWrong'));
          }
        },
      },
    ]);
  };

  const handlePickQrCode = async () => {
    if (!canEdit) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('common.error'), 'Permission to access media library is required to upload QR code.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;

      setIsUploadingQr(true);
      const uploaded = await uploadImageToCloudinary(picked.assets[0].uri, {
        filename: `qr_${clinic?.id || 'clinic'}.jpg`,
      });

      // Persist to backend immediately (like signature)
      await updateClinic({ qrCodeUrl: uploaded.secure_url });
      setQrCodeUrl(uploaded.secure_url);
      Alert.alert(t('common.success'), 'QR code uploaded successfully!');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.somethingWrong');
      Alert.alert(t('common.error'), msg);
    } finally {
      setIsUploadingQr(false);
    }
  };

  const handleRemoveQrCode = async () => {
    if (!canEdit) return;
    Alert.alert(
      'Remove QR Code',
      'Are you sure you want to remove the QR code image?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await updateClinic({ qrCodeUrl: null });
              setQrCodeUrl('');
              Alert.alert(t('common.success'), 'QR code removed.');
            } catch (error: unknown) {
              const msg = error instanceof Error ? error.message : t('common.somethingWrong');
              Alert.alert(t('common.error'), msg);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    loadClinic();
    loadDoctorProfile();
  }, []);

  useEffect(() => {
    if (clinic) {
      setClinicName(clinic.name || '');
      setAddress(clinic.address || '');
      setPhone(clinic.phone || '');
      setEmail(clinic.email || '');
      setQrCodeUrl(clinic.qrCodeUrl || '');
    }
  }, [clinic]);

  useEffect(() => {
    if (doctorProfile) {
      setDoctorName(doctorProfile.name || '');
      setSpecialty(doctorProfile.specialty || '');
      setRegNumber(doctorProfile.regNumber || '');
    }
  }, [doctorProfile]);

  const handleSave = async () => {
    if (!clinicName.trim()) {
      Alert.alert(t('common.required'), t('clinicProfile.clinicNameRequired'));
      return;
    }
    if (!doctorName.trim()) {
      Alert.alert(t('common.required'), t('clinicProfile.doctorNameRequired'));
      return;
    }

    setIsSaving(true);
    try {
      await updateClinic({
        name: clinicName.trim(),
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
      });

      await updateDoctorProfile({
        name: doctorName.trim(),
        specialty: specialty.trim(),
        regNumber: regNumber.trim(),
      });

      Alert.alert(t('common.success'), t('clinicProfile.savedSuccess'), [
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.somethingWrong');
      Alert.alert(t('common.error'), msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Clinic Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        keyboardVerticalOffset={KEYBOARD_VERTICAL_OFFSET}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            Platform.OS === 'android' && keyboardHeight > 0 && { paddingBottom: keyboardHeight + 100 }
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Restriction Banner for Assistants */}
          {!canEdit && (
            <View style={styles.restrictionBanner}>
              <Ionicons name="information-circle" size={20} color={COLORS.info} />
              <Text style={styles.restrictionText}>
                Only doctors and admins can edit clinic details. Contact your doctor to make changes.
              </Text>
            </View>
          )}

          {/* Clinic Details Section */}
          <View style={styles.sectionHeader}>
            <Ionicons name="business-outline" size={20} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Clinic Details</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Clinic Name *</Text>
              <TextInput
                style={[styles.input, !canEdit && styles.inputDisabled]}
                value={clinicName}
                onChangeText={setClinicName}
                placeholder="Enter clinic name"
                placeholderTextColor={COLORS.textLight}
                editable={canEdit}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Address</Text>
              <TextInput
                style={[styles.input, styles.multilineInput, !canEdit && styles.inputDisabled]}
                value={address}
                onChangeText={setAddress}
                placeholder="Enter clinic address"
                placeholderTextColor={COLORS.textLight}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={canEdit}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={[styles.input, !canEdit && styles.inputDisabled]}
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter phone number"
                placeholderTextColor={COLORS.textLight}
                keyboardType="phone-pad"
                editable={canEdit}
              />
            </View>

            <View style={styles.inputGroupLast}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, !canEdit && styles.inputDisabled]}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter email address"
                placeholderTextColor={COLORS.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={canEdit}
              />
            </View>
          </View>

          {/* Doctor Details Section */}
          <View style={styles.sectionHeader}>
            <Ionicons name="medkit-outline" size={20} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Doctor Details</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Doctor Name *</Text>
              <TextInput
                style={[styles.input, !canEdit && styles.inputDisabled]}
                value={doctorName}
                onChangeText={setDoctorName}
                placeholder="Enter doctor name"
                placeholderTextColor={COLORS.textLight}
                editable={canEdit}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Specialty</Text>
              <TextInput
                style={[styles.input, !canEdit && styles.inputDisabled]}
                value={specialty}
                onChangeText={setSpecialty}
                placeholder="e.g., General Physician, Cardiologist"
                placeholderTextColor={COLORS.textLight}
                editable={canEdit}
              />
            </View>

            <View style={styles.inputGroupLast}>
              <Text style={styles.label}>Registration Number</Text>
              <TextInput
                style={[styles.input, !canEdit && styles.inputDisabled]}
                value={regNumber}
                onChangeText={setRegNumber}
                placeholder="Medical registration number"
                placeholderTextColor={COLORS.textLight}
                editable={canEdit}
              />
            </View>
          </View>

          {/* Digital Signature (doctor/admin only) */}
          {canEdit && (
            <>
              <View style={styles.sectionHeader}>
                <Ionicons name="create-outline" size={20} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>{t('signature.title')}</Text>
              </View>
              <View style={styles.card}>
                <Text style={[styles.label, { marginBottom: SPACING.sm }]}>{t('signature.hint')}</Text>
                {signatureUrl ? (
                  <View style={styles.sigPreviewBox}>
                    {signatureUrl.startsWith('M') ? (
                      <Svg width={150} height={50} viewBox="0 0 300 100">
                        <Path
                          d={signatureUrl}
                          stroke={COLORS.text}
                          strokeWidth={4.5}
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </Svg>
                    ) : (
                      <Image source={{ uri: signatureUrl }} style={styles.sigPreviewImage} resizeMode="contain" />
                    )}
                  </View>
                ) : (
                  <View style={[styles.sigPreviewBox, styles.sigPreviewEmpty]}>
                    <Ionicons name="image-outline" size={32} color={COLORS.textLight} />
                    <Text style={styles.sigPreviewEmptyText}>{t('signature.noneYet')}</Text>
                  </View>
                )}
                <View style={styles.sigButtonRow}>
                  <TouchableOpacity
                    style={[styles.sigButton, isUploadingSig && styles.buttonDisabled]}
                    onPress={handlePickSignature}
                    disabled={isUploadingSig}
                    activeOpacity={0.7}
                  >
                    {isUploadingSig ? (
                      <ActivityIndicator color={COLORS.white} />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={18} color={COLORS.white} />
                        <Text style={styles.sigButtonText}>
                          {signatureUrl ? t('signature.replace') : t('signature.upload')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {signatureUrl ? (
                    <TouchableOpacity
                      style={styles.sigRemoveBtn}
                      onPress={handleRemoveSignature}
                      disabled={isUploadingSig}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              <View style={styles.sectionHeader}>
                <Ionicons name="qr-code-outline" size={20} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Clinic QR Code</Text>
              </View>
              <View style={styles.card}>
                <Text style={[styles.label, { marginBottom: SPACING.sm }]}>
                  Upload a payment or clinic website QR code to display on prescriptions.
                </Text>
                {qrCodeUrl ? (
                  <View style={styles.sigPreviewBox}>
                    <Image source={{ uri: qrCodeUrl }} style={styles.sigPreviewImage} resizeMode="contain" />
                  </View>
                ) : (
                  <View style={[styles.sigPreviewBox, styles.sigPreviewEmpty]}>
                    <Ionicons name="qr-code-outline" size={32} color={COLORS.textLight} />
                    <Text style={styles.sigPreviewEmptyText}>No QR code uploaded yet</Text>
                  </View>
                )}
                <View style={styles.sigButtonRow}>
                  <TouchableOpacity
                    style={[styles.sigButton, isUploadingQr && styles.buttonDisabled]}
                    onPress={handlePickQrCode}
                    disabled={isUploadingQr}
                    activeOpacity={0.7}
                  >
                    {isUploadingQr ? (
                      <ActivityIndicator color={COLORS.white} />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={18} color={COLORS.white} />
                        <Text style={styles.sigButtonText}>
                          {qrCodeUrl ? 'Replace QR Code' : 'Upload QR Code'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {qrCodeUrl ? (
                    <TouchableOpacity
                      style={styles.sigRemoveBtn}
                      onPress={handleRemoveQrCode}
                      disabled={isUploadingQr}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {/* Save Button - Only for doctors/admins */}
        {canEdit && (
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : SPACING.lg }]}>
            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              {isSaving ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.white} />
                  <Text style={styles.saveButtonText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
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
  backBtn: {
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
    paddingBottom: 100,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    marginTop: SPACING.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },

  // Card
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },

  // Input fields
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  inputGroupLast: {
    marginBottom: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.surfaceSecondary,
  },
  multilineInput: {
    minHeight: 80,
    paddingTop: SPACING.md,
  },
  inputDisabled: {
    backgroundColor: COLORS.disabled,
    color: COLORS.textMuted,
    opacity: 0.7,
  },

  // Restriction banner
  restrictionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.infoLight,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  restrictionText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.info,
    lineHeight: 18,
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
  saveButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    ...SHADOWS.md,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  // Signature card
  sigPreviewBox: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceSecondary,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  sigPreviewEmpty: {
    borderStyle: 'dashed',
  },
  sigPreviewImage: {
    width: '100%',
    height: '100%',
  },
  sigPreviewEmptyText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  sigButtonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  sigButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  sigButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 14,
  },
  sigRemoveBtn: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.error,
    backgroundColor: COLORS.errorLight,
  },
});
