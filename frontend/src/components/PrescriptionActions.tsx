/**
 * Three-button action bar shown wherever a prescription is viewable:
 *   - Share on WhatsApp (opens WA with the patient's number, then the share sheet
 *     so the doctor attaches the PDF)
 *   - Download PDF (saves a copy and opens the share sheet)
 *   - Print (native print dialog)
 *
 * The component owns PDF generation lazily — the first action that needs it
 * triggers `generatePrescriptionPDF`, the path is memoised in state so the
 * other two actions reuse it.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { Prescription } from '../types/prescription.types';
import { useClinicStore } from '../store/useClinicStore';
import { useAuthStore } from '../store/useAuthStore';
import { generatePrescriptionPDF, printPrescription, buildShareText } from '../services/pdfService';
import { exportPDFCopy, shareRxOnWhatsApp, shareViaPDF } from '../services/shareService';

interface Props {
  prescription: Prescription | null;
  /** Show only a subset (e.g. read-only views can hide WhatsApp share). */
  show?: { whatsapp?: boolean; download?: boolean; print?: boolean };
  layout?: 'row' | 'column';
}

export default function PrescriptionActions({ prescription, show, layout = 'row' }: Props): React.JSX.Element | null {
  const { t } = useTranslation();
  const { clinic, doctorProfile } = useClinicStore();
  const { user } = useAuthStore();
  const [busy, setBusy] = useState<null | 'whatsapp' | 'download' | 'print'>(null);
  const [pdfPath, setPdfPath] = useState<string | null>(null);

  if (!prescription) return null;
  const want = { whatsapp: true, download: true, print: true, ...show };

  const ensurePdf = async (): Promise<string> => {
    if (pdfPath) return pdfPath;
    // Inject the doctor's saved signature into the rx copy used for rendering.
    const rxForPdf = { ...prescription, signature: user?.signatureUrl || prescription.signature || null };
    const generated = await generatePrescriptionPDF(rxForPdf, clinic, doctorProfile);
    setPdfPath(generated);
    return generated;
  };

  const handleWhatsApp = async () => {
    if (busy) return;
    if (!prescription.patientPhone) {
      Alert.alert(t('common.error'), t('share.noPhone'));
      return;
    }

    Alert.alert(
      'Share Prescription',
      'Select how you would like to share the prescription:',
      [
        {
          text: 'Send Text',
          onPress: async () => {
            setBusy('whatsapp');
            try {
              const fullText = buildShareText(prescription, doctorProfile);
              await shareRxOnWhatsApp(fullText, prescription.patientPhone);
            } catch (e) {
              const msg = e instanceof Error ? e.message : t('common.somethingWrong');
              Alert.alert(t('common.error'), msg);
            } finally {
              setBusy(null);
            }
          },
        },
        {
          text: 'Send PDF',
          onPress: async () => {
            setBusy('whatsapp');
            try {
              const path = await ensurePdf();
              await shareViaPDF(path);
            } catch (e) {
              const msg = e instanceof Error ? e.message : t('common.somethingWrong');
              Alert.alert(t('common.error'), msg);
            } finally {
              setBusy(null);
            }
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  const handleDownload = async () => {
    if (busy) return;
    setBusy('download');
    try {
      const path = await ensurePdf();
      const visitDate = new Date(prescription.createdAt)
        .toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        .replace(/\//g, '-');
      const safeName = (prescription.patientName || 'Patient').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
      const friendly = `${visitDate}_${safeName}`;
      const exported = await exportPDFCopy(path, friendly);
      // Surface to the user — also opens the share sheet so they can save to Files / Drive.
      await shareViaPDF(exported);
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('share.saveFailed'));
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = async () => {
    if (busy) return;
    setBusy('print');
    try {
      // Print works off the HTML directly — no file move needed.
      const rxForPrint = { ...prescription, signature: user?.signatureUrl || prescription.signature || null };
      await printPrescription(rxForPrint, clinic, doctorProfile);
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('share.printFailed'));
    } finally {
      setBusy(null);
    }
  };

  const ButtonView = ({ active, icon, label, onPress, color }: {
    active: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color: string;
  }) => (
    <TouchableOpacity
      style={[
        styles.btn,
        layout === 'column' && styles.columnBtn,
        { borderColor: color },
        busy && styles.btnDisabled
      ]}
      onPress={onPress}
      disabled={busy !== null}
      activeOpacity={0.7}
    >
      {active ? (
        <ActivityIndicator color={color} />
      ) : (
        <Ionicons name={icon} size={18} color={color} />
      )}
      <Text style={[styles.btnLabel, { color }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.row, layout === 'column' && styles.column]}>
      {want.whatsapp && (
        <ButtonView
          active={busy === 'whatsapp'}
          icon="logo-whatsapp"
          label="Send to Patient (WhatsApp)"
          onPress={handleWhatsApp}
          color={COLORS.whatsapp}
        />
      )}
      {want.download && (
        <ButtonView
          active={busy === 'download'}
          icon="download-outline"
          label={t('share.download')}
          onPress={handleDownload}
          color={COLORS.primary}
        />
      )}
      {want.print && (
        <ButtonView
          active={busy === 'print'}
          icon="print-outline"
          label={t('share.print')}
          onPress={handlePrint}
          color={COLORS.textSecondary}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  column: {
    flexDirection: 'column',
  },
  columnBtn: {
    flex: 0,
    width: '100%',
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: 10,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    backgroundColor: COLORS.white,
    ...SHADOWS.sm,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnLabel: {
    fontWeight: '700',
    fontSize: 12,
  },
});
