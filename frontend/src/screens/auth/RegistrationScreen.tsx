import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { completeRegistration } from '../../services/authService';
import { useAuthStore } from '../../store/useAuthStore';
import { AuthStackParamList } from '../../types/navigation.types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Registration'>;

export default function RegistrationScreen({ route }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { role } = route.params;
  const isDoctor = role === 'doctor';
  const setUser = useAuthStore((s) => s.setUser);

  // Common
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Doctor fields
  const [specialty, setSpecialty] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicEmail, setClinicEmail] = useState('');

  // Assistant fields
  const [qualification, setQualification] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');

  const canSubmit = name.trim().length >= 2 && (!isDoctor || clinicName.trim().length >= 2);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsLoading(true);
    try {
      const data: Record<string, unknown> = { name: name.trim() };

      if (isDoctor) {
        if (specialty.trim()) data.specialty = specialty.trim();
        if (regNumber.trim()) data.regNumber = regNumber.trim();
        data.clinicName = clinicName.trim();
        if (clinicAddress.trim()) data.clinicAddress = clinicAddress.trim();
        if (clinicPhone.trim()) data.clinicPhone = clinicPhone.trim();
        if (clinicEmail.trim()) data.clinicEmail = clinicEmail.trim();
      } else {
        if (qualification.trim()) data.qualification = qualification.trim();
        if (experienceYears.trim()) data.experienceYears = parseInt(experienceYears) || 0;
        if (city.trim()) data.city = city.trim();
        if (address.trim()) data.address = address.trim();
      }

      const response = await completeRegistration(data as Parameters<typeof completeRegistration>[0]);
      await setUser(response.user, response.accessToken, response.refreshToken);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('auth.registrationFailed');
      Alert.alert(t('common.error'), msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 80}
      >
        <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Ionicons
              name={isDoctor ? 'medkit' : 'people'}
              size={48}
              color={COLORS.primary}
            />
            <Text style={styles.title}>{t('auth.completeProfile')}</Text>
            <Text style={styles.subtitle}>
              {isDoctor
                ? t('auth.doctorProfileHint')
                : t('auth.assistantProfileHint')}
            </Text>
          </View>

          <View style={styles.form}>
            {/* Full Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('auth.fullNameRequired')}</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={isDoctor ? t('auth.doctorNamePlaceholder') : t('auth.assistantNamePlaceholder')}
                placeholderTextColor={COLORS.textLight}
                autoFocus
              />
            </View>

            {isDoctor ? (
              <>
                {/* — Doctor personal details — */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t('auth.specialty')}</Text>
                  <TextInput
                    style={styles.input}
                    value={specialty}
                    onChangeText={setSpecialty}
                    placeholder={t('auth.specialtyPlaceholder')}
                    placeholderTextColor={COLORS.textLight}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t('auth.regNumber')}</Text>
                  <TextInput
                    style={styles.input}
                    value={regNumber}
                    onChangeText={setRegNumber}
                    placeholder={t('auth.regNumberPlaceholder')}
                    placeholderTextColor={COLORS.textLight}
                  />
                </View>

                {/* — Clinic details — */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerLabel}>Clinic Details</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t('auth.clinicNameRequired')}</Text>
                  <TextInput
                    style={styles.input}
                    value={clinicName}
                    onChangeText={setClinicName}
                    placeholder={t('auth.clinicNamePlaceholder')}
                    placeholderTextColor={COLORS.textLight}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Clinic Address</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={clinicAddress}
                    onChangeText={setClinicAddress}
                    placeholder="e.g. 12, MG Road, Pune"
                    placeholderTextColor={COLORS.textLight}
                    multiline
                    numberOfLines={2}
                  />
                </View>

                <View style={styles.row}>
                  <View style={[styles.inputGroup, styles.rowHalf]}>
                    <Text style={styles.label}>Clinic Phone</Text>
                    <TextInput
                      style={styles.input}
                      value={clinicPhone}
                      onChangeText={setClinicPhone}
                      placeholder="Phone number"
                      placeholderTextColor={COLORS.textLight}
                      keyboardType="phone-pad"
                      maxLength={15}
                    />
                  </View>
                  <View style={[styles.inputGroup, styles.rowHalf]}>
                    <Text style={styles.label}>Clinic Email</Text>
                    <TextInput
                      style={styles.input}
                      value={clinicEmail}
                      onChangeText={setClinicEmail}
                      placeholder="Email"
                      placeholderTextColor={COLORS.textLight}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              </>
            ) : (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t('auth.qualification')}</Text>
                  <TextInput
                    style={styles.input}
                    value={qualification}
                    onChangeText={setQualification}
                    placeholder={t('auth.qualificationPlaceholder')}
                    placeholderTextColor={COLORS.textLight}
                  />
                </View>

                <View style={styles.row}>
                  <View style={[styles.inputGroup, styles.rowHalf]}>
                    <Text style={styles.label}>{t('auth.experienceYears')}</Text>
                    <TextInput
                      style={styles.input}
                      value={experienceYears}
                      onChangeText={setExperienceYears}
                      placeholder={t('auth.experiencePlaceholder')}
                      placeholderTextColor={COLORS.textLight}
                      keyboardType="numeric"
                      maxLength={2}
                    />
                  </View>
                  <View style={[styles.inputGroup, styles.rowHalf]}>
                    <Text style={styles.label}>{t('auth.city')}</Text>
                    <TextInput
                      style={styles.input}
                      value={city}
                      onChangeText={setCity}
                      placeholder={t('auth.cityPlaceholder')}
                      placeholderTextColor={COLORS.textLight}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t('auth.address')}</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={address}
                    onChangeText={setAddress}
                    placeholder={t('auth.addressPlaceholder')}
                    placeholderTextColor={COLORS.textLight}
                    multiline
                    numberOfLines={2}
                  />
                </View>
              </>
            )}
          </View>

          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.buttonText}>{t('auth.getStarted')}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.xxxl,
  },
  header: {
    marginBottom: SPACING.xxl,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 22,
  },
  form: {
    marginBottom: SPACING.xxl,
  },
  inputGroup: {
    marginBottom: SPACING.xl,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.surfaceSecondary,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  rowHalf: {
    flex: 1,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xl,
    gap: SPACING.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    alignItems: 'center',
    ...SHADOWS.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
});
