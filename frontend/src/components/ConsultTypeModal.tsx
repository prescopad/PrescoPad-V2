import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

export interface ConsultTypeModalProps {
  visible: boolean;
  patientName?: string;
  onClose: () => void;
  onSelectType: (type: 'new' | 'follow_up') => void;
  isLoading?: boolean;
}

export const ConsultTypeModal: React.FC<ConsultTypeModalProps> = ({
  visible,
  patientName,
  onClose,
  onSelectType,
  isLoading,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.consultModalOverlay}>
        <View style={styles.consultModalSheet}>
          <View style={styles.consultModalHeader}>
            <Text style={styles.consultModalTitle}>Add to Queue</Text>
            <TouchableOpacity onPress={onClose} disabled={isLoading}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          {patientName && (
            <Text style={styles.consultModalPatient}>{patientName}</Text>
          )}
          <Text style={styles.consultModalSubtitle}>Is this a new consultation or a follow-up?</Text>

          <TouchableOpacity
            style={styles.consultOption}
            onPress={() => onSelectType('new')}
            activeOpacity={0.7}
            disabled={isLoading}
          >
            <View style={[styles.consultIconCircle, { backgroundColor: COLORS.successLight }]}>
              <Ionicons name="person-add-outline" size={26} color={COLORS.success} />
            </View>
            <View style={styles.consultInfo}>
              <Text style={styles.consultOptionTitle}>New Consultation</Text>
              <Text style={styles.consultOptionSubtitle}>First visit or new complaint</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.consultOption}
            onPress={() => onSelectType('follow_up')}
            activeOpacity={0.7}
            disabled={isLoading}
          >
            <View style={[styles.consultIconCircle, { backgroundColor: COLORS.primarySurface }]}>
              <Ionicons name="refresh-circle-outline" size={26} color={COLORS.primary} />
            </View>
            <View style={styles.consultInfo}>
              <Text style={styles.consultOptionTitle}>Follow-up</Text>
              <Text style={styles.consultOptionSubtitle}>Continuing treatment or review</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  consultModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  consultModalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl,
    paddingBottom: SPACING.xxxl,
  },
  consultModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  consultModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  consultModalPatient: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  consultModalSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: SPACING.xl,
  },
  consultOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  consultIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  consultInfo: {
    flex: 1,
  },
  consultOptionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  consultOptionSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
