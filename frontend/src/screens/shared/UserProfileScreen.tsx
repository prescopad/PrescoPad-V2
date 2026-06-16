import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ParamListBase } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';
import { updateProfile } from '../../services/authService';
import { HEADER_PADDING_TOP, KEYBOARD_VERTICAL_OFFSET } from '../../utils/responsive';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';

interface Props {
  navigation: NativeStackNavigationProp<ParamListBase>;
}

export default function UserProfileScreen({ navigation }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { user, setUser, accessToken, refreshToken } = useAuthStore();
  const keyboardHeight = useKeyboardHeight();
  const isDoctor = user?.role === 'doctor';
  const [isSaving, setIsSaving] = useState(false);

  // Common fields
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');

  // Doctor fields
  const [specialty, setSpecialty] = useState(user?.specialty || '');
  const [regNumber, setRegNumber] = useState(user?.regNumber || '');

  // Assistant fields
  const [qualification, setQualification] = useState(user?.qualification || '');
  const [experienceYears, setExperienceYears] = useState(
    user?.experienceYears ? String(user.experienceYears) : ''
  );
  const [city, setCity] = useState(user?.city || '');
  const [address, setAddress] = useState(user?.address || '');

  // Sync when user from auth store updates
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setSpecialty(user.specialty || '');
      setRegNumber(user.regNumber || '');
      setQualification(user.qualification || '');
      setExperienceYears(user.experienceYears ? String(user.experienceYears) : '');
      setCity(user.city || '');
      setAddress(user.address || '');
    }
  }, [user]);

  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(t('common.required'), 'Name is required.');
      return;
    }
    if (phone.trim().length > 0 && phone.trim().length < 10) {
      Alert.alert(t('common.required'), 'Enter a valid 10-digit phone number.');
      return;
    }

    setIsSaving(true);
    try {
      const payload: Parameters<typeof updateProfile>[0] = {
        name: name.trim(),
      };
      if (phone.trim() && phone.trim() !== user?.phone) payload.phone = phone.trim();
      if (isDoctor) {
        if (specialty.trim()) payload.specialty = specialty.trim();
        if (regNumber.trim()) payload.regNumber = regNumber.trim();
      } else {
        if (qualification.trim()) payload.qualification = qualification.trim();
        if (experienceYears.trim()) payload.experienceYears = parseInt(experienceYears) || 0;
        if (city.trim()) payload.city = city.trim();
        if (address.trim()) payload.address = address.trim();
      }

      const updatedUser = await updateProfile(payload);
      // setUser persists to secure store and updates global state
      await setUser(updatedUser, accessToken!, refreshToken!);
      Alert.alert(t('common.success'), 'Profile updated successfully!', [
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
        <Text style={styles.headerTitle}>My Profile</Text>
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
            Platform.OS === 'android' && keyboardHeight > 0 && { paddingBottom: keyboardHeight + 80 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar Card */}
          <View style={styles.avatarCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.avatarInfo}>
              <Text style={styles.avatarName}>{name || 'Your Name'}</Text>
              <View style={styles.roleBadge}>
                <Ionicons
                  name={isDoctor ? 'medkit' : 'people'}
                  size={12}
                  color={COLORS.primary}
                />
                <Text style={styles.roleText}>
                  {isDoctor ? 'Doctor' : 'Assistant'}
                </Text>
              </View>
              <Text style={styles.phoneText}>{phone || 'Phone not set'}</Text>
            </View>
          </View>

          {/* Basic Info Section */}
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={18} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Basic Information</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter your full name"
                placeholderTextColor={COLORS.textLight}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.phoneRow}>
                <View style={styles.countryCode}>
                  <Text style={styles.countryCodeText}>+91</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.phoneInput]}
                  value={phone}
                  onChangeText={(v) => setPhone(v.replace(/[^0-9]/g, '').slice(0, 10))}
                  placeholder="10-digit phone number"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="phone-pad"
                  maxLength={10}
                />
              </View>
              <Text style={styles.hint}>
                Changing your phone will update your login number. Must be unique.
              </Text>
            </View>
          </View>

          {/* Doctor Professional Details */}
          {isDoctor && (
            <>
              <View style={styles.sectionHeader}>
                <Ionicons name="medical-outline" size={18} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Professional Details</Text>
              </View>
              <View style={styles.card}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Specialty</Text>
                  <TextInput
                    style={styles.input}
                    value={specialty}
                    onChangeText={setSpecialty}
                    placeholder="e.g. Cardiology, General Medicine"
                    placeholderTextColor={COLORS.textLight}
                    autoCapitalize="words"
                  />
                </View>
                <View style={[styles.fieldGroup, { marginBottom: 0 }]}>
                  <Text style={styles.label}>Registration Number</Text>
                  <TextInput
                    style={styles.input}
                    value={regNumber}
                    onChangeText={setRegNumber}
                    placeholder="e.g. MH/12345/2020"
                    placeholderTextColor={COLORS.textLight}
                    autoCapitalize="characters"
                  />
                </View>
              </View>
            </>
          )}

          {/* Assistant Professional Details */}
          {!isDoctor && (
            <>
              <View style={styles.sectionHeader}>
                <Ionicons name="briefcase-outline" size={18} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Professional Details</Text>
              </View>
              <View style={styles.card}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Qualification</Text>
                  <TextInput
                    style={styles.input}
                    value={qualification}
                    onChangeText={setQualification}
                    placeholder="e.g. B.Sc Nursing, D.Pharm"
                    placeholderTextColor={COLORS.textLight}
                    autoCapitalize="words"
                  />
                </View>

                <View style={styles.twoColRow}>
                  <View style={[styles.fieldGroup, styles.halfField]}>
                    <Text style={styles.label}>Experience (yrs)</Text>
                    <TextInput
                      style={styles.input}
                      value={experienceYears}
                      onChangeText={(v) => setExperienceYears(v.replace(/[^0-9]/g, '').slice(0, 2))}
                      placeholder="e.g. 3"
                      placeholderTextColor={COLORS.textLight}
                      keyboardType="numeric"
                      maxLength={2}
                    />
                  </View>
                  <View style={[styles.fieldGroup, styles.halfField]}>
                    <Text style={styles.label}>City</Text>
                    <TextInput
                      style={styles.input}
                      value={city}
                      onChangeText={setCity}
                      placeholder="e.g. Pune"
                      placeholderTextColor={COLORS.textLight}
                      autoCapitalize="words"
                    />
                  </View>
                </View>

                <View style={[styles.fieldGroup, { marginBottom: 0 }]}>
                  <Text style={styles.label}>Address</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Your residential / work address"
                    placeholderTextColor={COLORS.textLight}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              </View>
            </>
          )}

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.85}
          >
            {isSaving ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.white} />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: { flex: 1 },
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
  backBtn: { padding: SPACING.xs },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerSpacer: { width: 32 },
  scrollView: { flex: 1 },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },

  // Avatar Card
  avatarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
    ...SHADOWS.md,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.lg,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.white,
  },
  avatarInfo: { flex: 1 },
  avatarName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primarySurface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
    marginBottom: SPACING.xs,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  phoneText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Card
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
    ...SHADOWS.sm,
  },

  // Fields
  fieldGroup: { marginBottom: SPACING.xl },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: 13,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.surfaceSecondary,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 13,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'stretch',
  },
  countryCode: {
    backgroundColor: COLORS.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  phoneInput: { flex: 1 },
  hint: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: SPACING.xs,
    fontStyle: 'italic',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  halfField: { flex: 1 },

  // Save Button
  saveButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    ...SHADOWS.md,
  },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
});
