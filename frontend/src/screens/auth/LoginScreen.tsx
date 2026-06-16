import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
  } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { sendOTP } from '../../services/authService';
import { UserRole } from '../../types/auth.types';
import { AuthStackParamList } from '../../types/navigation.types';
import { HEADER_PADDING_TOP, ms } from '../../utils/responsive';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation, route }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [activeRole, setActiveRole] = useState<UserRole>(route.params.role as UserRole);
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const isDoctor = activeRole === 'doctor';
  const role = activeRole;
  const title = isDoctor ? t('auth.doctorLogin') : t('auth.assistantLogin');
  const icon: keyof typeof Ionicons.glyphMap = isDoctor ? 'medkit' : 'people';

  const handleSendOTP = async () => {
    if (phone.length !== 10) {
      Alert.alert(t('common.invalid'), t('auth.invalidPhone'));
      return;
    }

    setIsLoading(true);
    try {
      await sendOTP(phone, role as UserRole);
      navigation.navigate('OTP', { phone, role });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('auth.failedSendOtp');
      Alert.alert(t('common.error'), msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.content}>
            <View style={[styles.iconCircle, { backgroundColor: isDoctor ? COLORS.primary : '#059669' }]}>
              <Ionicons name={icon} size={32} color={COLORS.white} />
            </View>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{t('auth.enterPhoneSubtitle')}</Text>

            {/* Role toggle — lets user switch without going back to landing */}
            <View style={styles.roleToggle}>
              <TouchableOpacity
                style={[styles.roleToggleBtn, isDoctor && styles.roleToggleBtnActive]}
                onPress={() => setActiveRole('doctor' as UserRole)}
                activeOpacity={0.7}
              >
                <Ionicons name="medkit-outline" size={16} color={isDoctor ? COLORS.white : COLORS.textMuted} />
                <Text style={[styles.roleToggleBtnText, isDoctor && styles.roleToggleBtnTextActive]}>Doctor</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleToggleBtn, !isDoctor && styles.roleToggleBtnActiveGreen]}
                onPress={() => setActiveRole('assistant' as UserRole)}
                activeOpacity={0.7}
              >
                <Ionicons name="people-outline" size={16} color={!isDoctor ? COLORS.white : COLORS.textMuted} />
                <Text style={[styles.roleToggleBtnText, !isDoctor && styles.roleToggleBtnTextActive]}>Assistant</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.countryCode}>+91</Text>
              <TextInput
                style={styles.input}
                placeholder={t('auth.enterPhoneShort')}
                placeholderTextColor={COLORS.textLight}
                value={phone}
                onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, '').slice(0, 10))}
                keyboardType="phone-pad"
                maxLength={10}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[styles.button, phone.length !== 10 && styles.buttonDisabled]}
              onPress={handleSendOTP}
              disabled={phone.length !== 10 || isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.buttonText}>{t('auth.sendOtp')}</Text>
              )}
            </TouchableOpacity>
          </View>
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
    paddingTop: HEADER_PADDING_TOP,
    paddingBottom: SPACING.xxxl,
  },
  backButton: {
    padding: SPACING.lg,
    paddingTop: SPACING.md,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: ms(26),
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: ms(14),
    color: COLORS.textMuted,
    marginBottom: SPACING.xxxl,
  },
  roleToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    marginBottom: SPACING.xxl,
    gap: 4,
  },
  roleToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    gap: SPACING.xs,
  },
  roleToggleBtnActive: {
    backgroundColor: COLORS.primary,
  },
  roleToggleBtnActiveGreen: {
    backgroundColor: '#059669',
  },
  roleToggleBtnText: {
    fontSize: ms(14),
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  roleToggleBtnTextActive: {
    color: COLORS.white,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.surfaceSecondary,
    marginBottom: SPACING.xl,
  },
  countryCode: {
    fontSize: ms(16),
    fontWeight: '600',
    color: COLORS.text,
    marginRight: SPACING.md,
    paddingRight: SPACING.md,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  input: {
    flex: 1,
    fontSize: ms(16),
    color: COLORS.text,
    paddingVertical: 14,
    letterSpacing: 1,
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
    fontSize: ms(16),
    fontWeight: '700',
    color: COLORS.white,
  },
});


