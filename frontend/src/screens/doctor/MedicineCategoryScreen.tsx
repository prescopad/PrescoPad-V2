import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { MedicineType } from '../../types/medicine.types';
import { DoctorStackParamList } from '../../types/navigation.types';

type MedicineCategoryScreenProps = NativeStackScreenProps<DoctorStackParamList, 'MedicineCategory'>;

const CATEGORIES: { label: string; icon: keyof typeof Ionicons.glyphMap; types: string[] }[] = [
  { label: 'Tablet', icon: 'ellipse-outline', types: [MedicineType.TABLET] },
  { label: 'Capsule', icon: 'ellipse', types: [MedicineType.CAPSULE] },
  { label: 'Syrup', icon: 'water-outline', types: [MedicineType.SYRUP] },
  { label: 'Injection', icon: 'medical-outline', types: [MedicineType.INJECTION] },
  { label: 'Ointment/Cream', icon: 'color-fill-outline', types: [MedicineType.OINTMENT, MedicineType.CREAM] },
  { label: 'Drops', icon: 'eyedrop-outline', types: [MedicineType.DROPS] },
  { label: 'Inhaler', icon: 'cloud-outline', types: [MedicineType.INHALER] },
  { label: 'Other', icon: 'apps-outline', types: [] }, // resolved to "exclude the above" downstream
];

const EXPLICIT_TYPES = CATEGORIES.filter((c) => c.label !== 'Other').flatMap((c) => c.types);

export default function MedicineCategoryScreen({ navigation }: MedicineCategoryScreenProps): React.JSX.Element {
  const handleSelectCategory = (category: typeof CATEGORIES[number]) => {
    if (category.label === 'Other') {
      navigation.navigate('MedicinePicker', { excludeTypes: EXPLICIT_TYPES });
    } else {
      navigation.navigate('MedicinePicker', { types: category.types });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.navBackBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navHeaderTitle}>Add Medicine</Text>
        <View style={styles.navHeaderSpacer} />
      </View>

      <View style={styles.container}>
        <Text style={styles.sectionLabel}>Select Medicine Type</Text>
        <View style={styles.grid}>
          {CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category.label}
              style={styles.card}
              onPress={() => handleSelectCategory(category)}
              activeOpacity={0.7}
            >
              <Ionicons name={category.icon} size={28} color={COLORS.primary} />
              <Text style={styles.cardLabel}>{category.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
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
    padding: SPACING.lg,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  card: {
    width: '47%',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingVertical: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
});
