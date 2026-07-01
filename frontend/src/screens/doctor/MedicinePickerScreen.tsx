import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { usePrescriptionStore } from '../../store/usePrescriptionStore';
import {
  getMedicinesByCategory,
  getMedicinesOutsideCategories,
  addCustomMedicine,
  incrementMedicineUsage,
} from '../../services/dataService';
import {
  Medicine,
  MedicineType,
  FREQUENCY_OPTIONS,
  TIMING_OPTIONS,
  DURATION_OPTIONS,
  getDosageHint,
} from '../../types/medicine.types';
import { DoctorStackParamList } from '../../types/navigation.types';
import { KEYBOARD_VERTICAL_OFFSET } from '../../utils/responsive';

type MedicinePickerScreenProps = NativeStackScreenProps<DoctorStackParamList, 'MedicinePicker'>;

export default function MedicinePickerScreen({ navigation, route }: MedicinePickerScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const addMedicine = usePrescriptionStore((s) => s.addMedicine);
  const categoryTypes = route.params?.types;
  const excludeTypes = route.params?.excludeTypes;
  const defaultType = categoryTypes?.[0] ?? MedicineType.TABLET;

  const [query, setQuery] = useState('');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);

  // Dosage form fields
  const [frequency, setFrequency] = useState('');
  const [duration, setDuration] = useState('');
  const [timing, setTiming] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedType, setSelectedType] = useState<string>(defaultType);
  const [dosage, setDosage] = useState('');

  // Custom medicine
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customStrength, setCustomStrength] = useState('');

  const searchInputRef = useRef<TextInput>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMedicines = useCallback(async (text: string) => {
    if (excludeTypes) return getMedicinesOutsideCategories(excludeTypes, text);
    return getMedicinesByCategory(categoryTypes ?? [], text);
  }, [categoryTypes, excludeTypes]);

  useEffect(() => {
    loadMedicines('');
    // Auto-focus search bar
    setTimeout(() => searchInputRef.current?.focus(), 300);
  }, []);

  const loadMedicines = async (text: string) => {
    try {
      const results = await fetchMedicines(text);
      setMedicines(results);
    } catch {
      // Silently handle
    }
  };

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    setSelectedMedicine(null);
    setShowCustomForm(false);

    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await fetchMedicines(text.trim());
        setMedicines(results);
      } catch {
        // Silently handle
      } finally {
        setIsSearching(false);
      }
    }, 200);
  }, [fetchMedicines]);

  const handleSelectMedicine = (medicine: Medicine) => {
    setSelectedMedicine(medicine);
    setFrequency('');
    setDuration('');
    setTiming('');
    setNotes('');
    setSelectedType(medicine.type || MedicineType.TABLET);
    setDosage(medicine.strength || '');
    setShowCustomForm(false);
  };

  const handleAddMedicine = async () => {
    if (!selectedMedicine) return;

    // frequency / duration / timing are optional — doctor can add them later
    // or write the medicine without them.
    addMedicine({
      medicineName: selectedMedicine.name,
      type: selectedType,
      dosage,
      frequency,
      duration,
      timing,
      notes,
    });

    // Increment usage count for ranking
    try {
      await incrementMedicineUsage(selectedMedicine.name, selectedMedicine.isCustom ?? false);
    } catch {
      // Non-critical
    }

    navigation.goBack();
  };

  const handleShowCustomForm = () => {
    setSelectedMedicine(null);
    setShowCustomForm(true);
    setCustomName(query);
    setSelectedType(defaultType);
    setCustomStrength('');
  };

  const handleAddCustomMedicine = async () => {
    if (!customName.trim()) {
      Alert.alert(t('common.required'),'Please enter medicine name.');
      return;
    }
    // frequency / duration / timing are optional.

    try {
      const custom = await addCustomMedicine(customName.trim(), selectedType, customStrength);

      addMedicine({
        medicineName: custom.name,
        type: selectedType,
        dosage: customStrength,
        frequency,
        duration,
        timing,
        notes,
      });

      navigation.goBack();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to add custom medicine';
      Alert.alert(t('common.error'), msg);
    }
  };

  const renderOptionChips = (
    options: readonly string[],
    selected: string,
    onSelect: (val: string) => void,
  ) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsContainer}
    >
      {options.map((option) => (
        <TouchableOpacity
          key={option}
          style={[styles.chip, selected === option && styles.chipSelected]}
          onPress={() => onSelect(option)}
          activeOpacity={0.7}
        >
          <Text
            style={[styles.chipText, selected === option && styles.chipTextSelected]}
          >
            {option}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderMedicineItem = ({ item }: { item: Medicine }) => {
    const isSelected = selectedMedicine?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.medicineItem, isSelected && styles.medicineItemSelected]}
        onPress={() => handleSelectMedicine(item)}
        activeOpacity={0.7}
      >
        <View style={styles.medicineInfo}>
          <Text style={[styles.medicineName, isSelected && styles.medicineNameSelected]}>
            {item.name}
          </Text>
          <Text style={styles.medicineDetails}>
            {item.type}{item.strength ? ` - ${item.strength}` : ''}
          </Text>
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
        )}
      </TouchableOpacity>
    );
  };

  const renderDosageForm = () => (
    <View style={styles.dosageForm}>
      <View style={styles.dosageDivider} />

      <Text style={styles.dosageTitle}>
        {selectedMedicine ? selectedMedicine.name : customName} - Dosage Details
      </Text>

      {/* Custom fields if custom form */}
      {showCustomForm && (
        <>
          <Text style={styles.fieldLabel}>Medicine Name *</Text>
          <TextInput
            style={styles.textInputField}
            placeholder="Medicine name"
            placeholderTextColor={COLORS.textLight}
            value={customName}
            onChangeText={setCustomName}
          />

          <Text style={styles.fieldLabel}>Type</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContainer}
          >
            {Object.values(MedicineType).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.chip, selectedType === type && styles.chipSelected]}
                onPress={() => setSelectedType(type)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, selectedType === type && styles.chipTextSelected]}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      <Text style={styles.fieldLabel}>{showCustomForm ? 'Strength' : 'Dosage'}</Text>
      <TextInput
        style={styles.textInputField}
        placeholder={getDosageHint(selectedType)}
        placeholderTextColor={COLORS.textLight}
        value={showCustomForm ? customStrength : dosage}
        onChangeText={showCustomForm ? setCustomStrength : setDosage}
      />

      <Text style={styles.fieldLabel}>{t('consult.frequency')}</Text>
      {renderOptionChips(FREQUENCY_OPTIONS, frequency, setFrequency)}

      <Text style={styles.fieldLabel}>{t('consult.duration')}</Text>
      {renderOptionChips(DURATION_OPTIONS, duration, setDuration)}

      <Text style={styles.fieldLabel}>{t('consult.timing')}</Text>
      {renderOptionChips(TIMING_OPTIONS, timing, setTiming)}

      <Text style={styles.fieldLabel}>{t('consult.notes')} ({t('common.optional')})</Text>
      <TextInput
        style={styles.textInputField}
        placeholder="Any special instructions..."
        placeholderTextColor={COLORS.textLight}
        value={notes}
        onChangeText={setNotes}
      />

      <TouchableOpacity
        style={styles.addMedicineButton}
        onPress={showCustomForm ? handleAddCustomMedicine : handleAddMedicine}
        activeOpacity={0.8}
      >
        <Ionicons name="add-circle" size={20} color={COLORS.white} />
        <Text style={styles.addMedicineButtonText}>{t('consult.addMedicine')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }} edges={['top', 'left', 'right', 'bottom']}>
    <StatusBar backgroundColor={COLORS.white} barStyle="dark-content" />
    {/* Custom navigation header */}
    <View style={styles.navHeader}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.navBackBtn}>
        <Ionicons name="arrow-back" size={24} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.navHeaderTitle}>Add Medicine</Text>
      <View style={styles.navHeaderSpacer} />
    </View>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={Platform.OS === 'ios'}
      keyboardVerticalOffset={KEYBOARD_VERTICAL_OFFSET}
    >
      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={COLORS.textMuted} />
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder="Search medicines..."
          placeholderTextColor={COLORS.textLight}
          value={query}
          onChangeText={handleSearch}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Ionicons name="close-circle" size={20} color={COLORS.textLight} />
          </TouchableOpacity>
        )}
        {isSearching && <ActivityIndicator size="small" color={COLORS.primary} />}
      </View>

      {/* Selected medicine / Custom form -> dosage form */}
      {(selectedMedicine || showCustomForm) ? (
        <ScrollView
          style={styles.dosageScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderDosageForm()}
        </ScrollView>
      ) : (
        <>
          {/* Medicine List */}
          <FlatList
            data={medicines}
            keyExtractor={(item) => item.id}
            renderItem={renderMedicineItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <Text style={styles.listHeader}>
                {query.length > 0 ? 'Search Results' : 'Medicines'}
              </Text>
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="medical-outline" size={40} color={COLORS.textLight} />
                <Text style={styles.emptyText}>No medicines found</Text>
              </View>
            }
            ListFooterComponent={
              <TouchableOpacity
                style={styles.customButton}
                onPress={handleShowCustomForm}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
                <Text style={styles.customButtonText}>
                  Add Custom Medicine{query ? `: "${query}"` : ''}
                </Text>
              </TouchableOpacity>
            }
          />
        </>
      )}
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Nav Header
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
  },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    paddingVertical: SPACING.md,
  },

  // List
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  listHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },

  // Medicine Item
  medicineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.sm,
  },
  medicineItemSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySurface,
  },
  medicineInfo: {
    flex: 1,
  },
  medicineName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  medicineNameSelected: {
    color: COLORS.primaryDark,
  },
  medicineDetails: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Dosage Form
  dosageScroll: {
    flex: 1,
  },
  dosageForm: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxxl * 2,
  },
  dosageDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },
  dosageTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  textInputField: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 14,
    color: COLORS.text,
  },

  // Chips
  chipsContainer: {
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  chip: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  chipTextSelected: {
    color: COLORS.white,
  },

  // Add Medicine Button
  addMedicineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    marginTop: SPACING.xl,
    gap: SPACING.sm,
    ...SHADOWS.md,
  },
  addMedicineButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Custom Button
  customButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySurface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
    borderStyle: 'dashed',
    paddingVertical: SPACING.lg,
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  customButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.md,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
});
