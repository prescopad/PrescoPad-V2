import * as Print from 'expo-print';
import { File, Directory, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { Prescription } from '../types/prescription.types';
import { Clinic, DoctorProfile } from '../types/clinic.types';

async function getBase64FromUrl(url: string): Promise<string | null> {
  try {
    if (!url) return null;
    if (url.startsWith('data:')) return url;
    if (url.startsWith('M') || url.startsWith('m')) return url;

    const tempFilename = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const localUri = `${FileSystem.cacheDirectory}${tempFilename}`;

    const downloadResult = await FileSystem.downloadAsync(url, localUri);
    if (downloadResult.status !== 200) {
      return null;
    }

    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    await FileSystem.deleteAsync(localUri, { idempotent: true });

    let mimeType = 'image/jpeg';
    if (url.toLowerCase().endsWith('.png')) mimeType = 'image/png';
    else if (url.toLowerCase().endsWith('.gif')) mimeType = 'image/gif';
    else if (url.toLowerCase().endsWith('.svg')) mimeType = 'image/svg+xml';

    return `data:${mimeType};base64,${base64}`;
  } catch (e) {
    console.error('Failed to get base64 from url:', e);
    return null;
  }
}

export async function generatePrescriptionPDF(
  prescription: Prescription,
  clinic: Clinic | null,
  doctor: DoctorProfile | null,
): Promise<string> {
  let signatureBase64 = prescription.signature;
  if (signatureBase64 && (signatureBase64.startsWith('http://') || signatureBase64.startsWith('https://'))) {
    const converted = await getBase64FromUrl(signatureBase64);
    if (converted) {
      signatureBase64 = converted;
    }
  }

  let clinicQrBase64 = clinic?.qrCodeUrl || null;
  if (clinicQrBase64 && (clinicQrBase64.startsWith('http://') || clinicQrBase64.startsWith('https://'))) {
    const converted = await getBase64FromUrl(clinicQrBase64);
    if (converted) {
      clinicQrBase64 = converted;
    }
  }

  const rxForPdf = { ...prescription, signature: signatureBase64 };
  const html = buildPrescriptionHTML(rxForPdf, clinic, doctor, clinicQrBase64);
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });

  // Move to permanent location — filename: Date_of_Visit_Name_of_Patient
  const visitDate = new Date(prescription.createdAt)
    .toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .replace(/\//g, '-');
  const safeName = (prescription.patientName || 'Patient').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
  const fileName = `${visitDate}_${safeName}.pdf`;
  const prescriptionsDir = new Directory(Paths.document, 'prescriptions');

  // Ensure directory exists
  if (!prescriptionsDir.exists) {
    prescriptionsDir.create({ intermediates: true });
  }

  const destFile = new File(prescriptionsDir, fileName);
  const sourceFile = new File(uri);
  // Delete existing file first to avoid FileAlreadyExistsException
  // (same patient + same day = same filename)
  if (destFile.exists) {
    destFile.delete();
  }
  sourceFile.move(destFile);
  return destFile.uri;
}

/**
 * Open the native print dialog for an already-generated prescription. If the
 * PDF doesn't exist yet, the caller should generate it first via
 * generatePrescriptionPDF.
 */
export async function printPrescription(
  prescription: Prescription,
  clinic: Clinic | null,
  doctor: DoctorProfile | null,
): Promise<void> {
  let signatureBase64 = prescription.signature;
  if (signatureBase64 && (signatureBase64.startsWith('http://') || signatureBase64.startsWith('https://'))) {
    const converted = await getBase64FromUrl(signatureBase64);
    if (converted) {
      signatureBase64 = converted;
    }
  }

  let clinicQrBase64 = clinic?.qrCodeUrl || null;
  if (clinicQrBase64 && (clinicQrBase64.startsWith('http://') || clinicQrBase64.startsWith('https://'))) {
    const converted = await getBase64FromUrl(clinicQrBase64);
    if (converted) {
      clinicQrBase64 = converted;
    }
  }

  const rxForPrint = { ...prescription, signature: signatureBase64 };
  const html = buildPrescriptionHTML(rxForPrint, clinic, doctor, clinicQrBase64);
  await Print.printAsync({ html });
}

// ═══════════════════════════════════════════════════════════════════════════
// Redesigned HTML template — matches the backend ReportLab PDF layout
// ═══════════════════════════════════════════════════════════════════════════
function buildPrescriptionHTML(
  rx: Prescription,
  clinic: Clinic | null,
  doctor: DoctorProfile | null,
  clinicQrBase64: string | null = null
): string {
  // ── Extract fields ─────────────────────────────────────────────────────
  const clinicName = clinic?.name || 'PrescoPad Clinic';
  const clinicAddress = clinic?.address || '';
  const clinicPhone = clinic?.phone || '';
  const clinicEmail = clinic?.email || '';
  const doctorName = doctor?.name || 'Doctor';
  const doctorSpecialty = doctor?.specialty || '';
  const doctorReg = doctor?.regNumber || '';
  const dateStr = new Date(rx.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // ── Doctor info line ───────────────────────────────────────────────────
  const doctorLine = [
    `Dr. ${doctorName}`,
    doctorSpecialty,
    doctorReg ? `Reg: ${doctorReg}` : '',
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');

  // ── Clinic contact sub-lines ───────────────────────────────────────────
  const clinicSubLine1 = clinicAddress || '';
  const clinicSubLine2 = [clinicPhone, clinicEmail].filter(Boolean).join(' &nbsp;|&nbsp; ');

  // ── Consultation type ──────────────────────────────────────────────────
  const consultType = rx.consultationType;
  let consultBadge = '';
  if (consultType === 'new') consultBadge = 'New Consultation';
  else if (consultType === 'follow_up') consultBadge = 'Follow-up';

  // ── Medicine rows ──────────────────────────────────────────────────────
  const medicineRows = rx.medicines
    .map(
      (m, i) => `
      <tr style="background:${i % 2 === 1 ? '#F0F7F7' : '#fff'};">
        <td style="padding:8px 6px;border:0.5px solid #e5e7eb;text-align:center;color:#374151;font-size:10px;">${i + 1}</td>
        <td style="padding:8px 6px;border:0.5px solid #e5e7eb;">
          <strong style="color:#111827;font-size:10px;">${m.medicineName}</strong>
          <span style="color:#6b7280;font-size:9px;"> (${m.type})</span>
        </td>
        <td style="padding:8px 6px;border:0.5px solid #e5e7eb;color:#374151;font-size:10px;">${m.frequency}</td>
        <td style="padding:8px 6px;border:0.5px solid #e5e7eb;color:#374151;font-size:10px;">${m.duration}</td>
        <td style="padding:8px 6px;border:0.5px solid #e5e7eb;color:#374151;font-size:10px;">${m.timing}${m.notes ? ` (${m.notes})` : ''}</td>
      </tr>`
    )
    .join('');

  // ── Lab test items ─────────────────────────────────────────────────────
  const labTestItems = rx.labTests
    .map((t) => {
      const notesStr = t.notes ? ` — <span style="color:#555555;">${t.notes}</span>` : '';
      return `<div style="padding:2px 0 2px 12px;font-size:10px;color:#111827;">&#8226;&nbsp;<strong>${t.testName}</strong>${notesStr}</div>`;
    })
    .join('');

  // ── Symptoms section ───────────────────────────────────────────────────
  const symptomsHtml = rx.symptoms && rx.symptoms.length > 0
    ? `<div style="margin-top:10px;margin-bottom:6px;">
         <div class="section-title">Symptoms</div>
         <div style="font-size:10px;color:#111827;line-height:1.5;">${rx.symptoms.join(', ')}</div>
       </div>`
    : '';

  // ── Diagnosis section ──────────────────────────────────────────────────
  const diagnosisHtml = rx.diagnosis
    ? `<div style="margin-top:10px;margin-bottom:6px;">
         <div class="section-title">Diagnosis</div>
         <div class="accent-box-diag">${rx.diagnosis}</div>
       </div>`
    : '';

  // ── Medicines section ──────────────────────────────────────────────────
  const medicinesHtml = rx.medicines.length > 0
    ? `<div style="margin-top:10px;margin-bottom:8px;">
         <div style="font-size:16px;font-weight:700;color:#0B6E6E;margin-bottom:6px;">&#8478; &nbsp;Medicines</div>
         <table class="med-table">
           <thead>
             <tr>
               <th style="width:28px;text-align:center;">#</th>
               <th>Medicine</th>
               <th>Dosage</th>
               <th>Duration</th>
               <th>Instructions</th>
             </tr>
           </thead>
           <tbody>${medicineRows}</tbody>
         </table>
       </div>`
    : '';

  // ── Lab tests section ──────────────────────────────────────────────────
  const labTestsHtml = rx.labTests.length > 0
    ? `<div style="margin-top:10px;margin-bottom:6px;">
         <div class="section-title">Lab Tests / Investigations</div>
         ${labTestItems}
       </div>`
    : '';

  // ── Advice section ─────────────────────────────────────────────────────
  const adviceHtml = rx.advice
    ? `<div style="margin-top:10px;margin-bottom:6px;">
         <div class="section-title">Special Instructions / Doctor's Notes</div>
         <div class="accent-box-advice">${rx.advice}</div>
       </div>`
    : '';

  // ── Referred To ─────────────────────────────────────────────────────
  const referredToHtml = rx.referredTo
    ? `<div style="margin-top:10px;margin-bottom:6px;">
         <div class="section-title">Referred To</div>
         <div style="font-size:11px;font-weight:700;color:#111827;">${rx.referredTo}</div>
       </div>`
    : '';

  // ── Follow-up date ─────────────────────────────────────────────────────
  const followUpHtml = rx.followUpDate
    ? `<div style="font-size:11px;font-weight:700;color:#dc2626;margin-top:10px;margin-bottom:6px;">
         Follow-up: ${new Date(rx.followUpDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
       </div>`
    : '';

  // ── Signature block ────────────────────────────────────────────────────
  let signatureImg = '';
  if (rx.signature) {
    if (rx.signature.startsWith('M') || rx.signature.startsWith('m')) {
      // SVG path data — render inline SVG
      signatureImg = `
        <svg width="150" height="60" viewBox="0 0 300 100" style="display:block;margin-left:auto;margin-bottom:4px;">
          <path d="${rx.signature}" stroke="#0F172A" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </svg>`;
    } else {
      // Base64 / data URL image
      signatureImg = `<img src="${rx.signature}" style="max-height:60px;max-width:150px;display:block;margin-left:auto;margin-bottom:4px;" />`;
    }
  }

  const regHtml = doctorReg ? `<div style="font-size:9px;color:#6b7280;text-align:right;">Reg. No: ${doctorReg}</div>` : '';

  // ── QR code block ──────────────────────────────────────────────────────
  const qrHtml = clinicQrBase64
    ? `<div>
         <img src="${clinicQrBase64}" style="height:60px;width:60px;margin-bottom:2px;" />
         <div style="font-size:7px;color:#9ca3af;">Scan for Payment / Details</div>
       </div>`
    : '';

  // ══════════════════════════════════════════════════════════════════════
  // Full HTML document
  // ══════════════════════════════════════════════════════════════════════
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* ── Reset ── */
    * { margin: 0; padding: 0; box-sizing: border-box; }

    /* ── Page ── */
    @page { size: A4; margin: 40px 50px; }
    body {
      font-family: Helvetica, Arial, sans-serif;
      color: #111827;
      padding: 40px 50px;
      background: #fff;
      font-size: 10px;
      line-height: 1.4;
    }

    /* ── Header ── */
    .clinic-name {
      font-size: 20px;
      font-weight: 700;
      color: #0B6E6E;
      text-align: center;
      margin-bottom: 2px;
    }
    .doctor-line {
      font-size: 13px;
      font-weight: 700;
      color: #111827;
      text-align: center;
      margin-top: 2px;
      margin-bottom: 2px;
    }
    .clinic-sub {
      font-size: 9px;
      color: #6b7280;
      text-align: center;
      margin-top: 1px;
    }
    .header-rule {
      border: none;
      border-top: 2px solid #0B6E6E;
      margin: 8px 0;
    }

    /* ── Meta row ── */
    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .meta-row .consult-badge {
      font-size: 9px;
      font-weight: 700;
      color: #0B6E6E;
    }
    .meta-row .date-id {
      font-size: 10px;
      color: #6b7280;
      text-align: right;
    }

    /* ── Patient info ── */
    table.patient-table {
      width: 100%;
      border-collapse: collapse;
      border-top: 0.5px solid #e5e7eb;
      border-bottom: 0.5px solid #e5e7eb;
      margin-bottom: 6px;
    }
    .p-label {
      font-size: 8px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      padding-bottom: 2px;
    }
    .p-value {
      font-size: 11px;
      font-weight: 700;
      color: #111827;
    }

    /* ── Section titles ── */
    .section-title {
      font-size: 12px;
      font-weight: 700;
      color: #0B6E6E;
      margin-bottom: 4px;
    }

    /* ── Styled accent boxes ── */
    .accent-box-diag {
      font-size: 10px;
      color: #111827;
      line-height: 1.5;
      padding: 8px 12px;
      background: #f0f9ff;
      border-left: 3px solid #1d6fa4;
    }
    .accent-box-advice {
      font-size: 10px;
      color: #111827;
      line-height: 1.5;
      padding: 8px 12px;
      background: #fffbeb;
      border-left: 3px solid #d97706;
    }

    /* ── Medicine table ── */
    table.med-table {
      width: 100%;
      border-collapse: collapse;
    }
    table.med-table th {
      background: #0B6E6E;
      color: #fff;
      padding: 7px 6px;
      text-align: left;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      font-weight: 700;
    }

    /* ── Signature section ── */
    .sig-name {
      font-size: 11px;
      font-weight: 700;
      color: #111827;
      text-align: right;
    }

    /* ── Footer ── */
    .footer {
      text-align: center;
      margin-top: 12px;
      padding-top: 6px;
      border-top: 0.5px solid #e5e7eb;
      font-size: 8px;
      color: #9ca3af;
    }
    .hash {
      font-family: monospace;
      font-size: 7px;
      color: #d1d5db;
      word-break: break-all;
      margin-top: 2px;
    }
  </style>
</head>
<body>

  <!-- ═══════ HEADER ═══════ -->
  <div class="clinic-name">${clinicName}</div>
  <div class="doctor-line">${doctorLine}</div>
  ${clinicSubLine1 ? `<div class="clinic-sub">${clinicSubLine1}</div>` : ''}
  ${clinicSubLine2 ? `<div class="clinic-sub">${clinicSubLine2}</div>` : ''}
  <hr class="header-rule" />

  <!-- ═══════ META ROW ═══════ -->
  <table style="width:100%;margin-bottom:6px;"><tr>
    <td style="text-align:left;vertical-align:middle;">
      ${consultBadge ? `<span class="consult-badge">${consultBadge}</span>` : ''}
    </td>
    <td style="text-align:right;vertical-align:middle;" class="date-id">
      Date: <strong>${dateStr}</strong> &nbsp;|&nbsp; ID: <strong style="color:#0B6E6E;">${rx.id}</strong>
    </td>
  </tr></table>

  <!-- ═══════ PATIENT INFO ═══════ -->
  <table class="patient-table">
    <tr>
      <td style="width:34%;padding:8px 6px;vertical-align:top;">
        <div class="p-label">Patient</div>
        <div class="p-value">${rx.patientName}</div>
      </td>
      <td style="width:33%;padding:8px 6px;vertical-align:top;">
        <div class="p-label">Age / Gender</div>
        <div class="p-value">${rx.patientAge} yrs / ${rx.patientGender}</div>
      </td>
      <td style="width:33%;padding:8px 6px;vertical-align:top;">
        <div class="p-label">Phone</div>
        <div class="p-value">${rx.patientPhone || '—'}</div>
      </td>
    </tr>
  </table>

  <!-- ═══════ BODY SECTIONS ═══════ -->
  ${symptomsHtml}
  ${diagnosisHtml}
  ${medicinesHtml}
  ${labTestsHtml}
  ${adviceHtml}
  ${referredToHtml}
  ${followUpHtml}

  <!-- ═══════ SIGNATURE ═══════ -->
  <div style="margin-top:20px;border-top:0.5px solid #e5e7eb;padding-top:10px;">
    <table style="width:100%;border:none;border-collapse:collapse;">
      <tr>
        <td style="vertical-align:bottom;text-align:left;width:50%;">
          ${qrHtml}
        </td>
        <td style="vertical-align:bottom;text-align:right;width:50%;">
          ${signatureImg}
          <div style="display:inline-block;min-width:150px;padding-top:4px;text-align:right;">
            <div class="sig-name">Dr. ${doctorName}</div>
            ${doctorSpecialty ? `<div style="font-size:9px;color:#6b7280;text-align:right;">${doctorSpecialty}</div>` : ''}
            ${regHtml}
          </div>
        </td>
      </tr>
    </table>
  </div>

  <!-- ═══════ FOOTER ═══════ -->
  <div class="footer">
    <div>Generated by PrescoPad &mdash; Digital Prescription System</div>
    ${rx.pdfHash ? `<div class="hash">Verification Hash: ${rx.pdfHash}</div>` : ''}
  </div>

</body>
</html>`;
}

export function buildShareText(
  rx: Prescription,
  doctor: DoctorProfile | null
): string {
  const dateStr = new Date(rx.createdAt).toLocaleDateString('en-IN');
  let text = `*Prescription - ${rx.id}*\n`;
  text += `Date: ${dateStr}\n`;
  text += `Doctor: Dr. ${doctor?.name || 'Doctor'}\n\n`;
  text += `*Patient:* ${rx.patientName} (${rx.patientAge}/${rx.patientGender})\n`;
  if (rx.consultationType) {
    text += `*Consultation:* ${rx.consultationType === 'new' ? 'New Consultation' : 'Follow-up'}\n`;
  }
  text += `\n`;



  if (rx.symptoms && rx.symptoms.length > 0) {
    text += `*Symptoms:* ${rx.symptoms.join(', ')}\n\n`;
  }

  if (rx.diagnosis) {
    text += `*Diagnosis:* ${rx.diagnosis}\n\n`;
  }

  if (rx.medicines.length > 0) {
    text += `*Medicines:*\n`;
    rx.medicines.forEach((m, i) => {
      text += `${i + 1}. ${m.medicineName} (${m.type})\n`;
      text += `   ${m.frequency} | ${m.duration} | ${m.timing}\n`;
    });
    text += '\n';
  }

  if (rx.labTests.length > 0) {
    text += `*Lab Tests:*\n`;
    rx.labTests.forEach((t, i) => {
      text += `${i + 1}. ${t.testName}\n`;
    });
    text += '\n';
  }

  if (rx.advice) {
    text += `*Advice:* ${rx.advice}\n\n`;
  }

  if (rx.followUpDate) {
    text += `*Follow-up:* ${new Date(rx.followUpDate).toLocaleDateString('en-IN')}\n\n`;
  }

  if (rx.referredTo) {
    text += `*Referred To:* ${rx.referredTo}\n\n`;
  }

  text += `_Generated by PrescoPad_`;
  return text;
}
