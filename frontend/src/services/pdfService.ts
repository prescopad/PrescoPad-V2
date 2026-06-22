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

function buildPrescriptionHTML(
  rx: Prescription,
  clinic: Clinic | null,
  doctor: DoctorProfile | null,
  clinicQrBase64: string | null = null
): string {
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

  const doctorLine = [
    `Dr. ${doctorName}`,
    doctorSpecialty,
    doctorReg ? `Reg: ${doctorReg}` : '',
  ].filter(Boolean).join(' | ');

  const medicineRows = rx.medicines
    .map(
      (m, i) => `
      <tr>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:12px;">${i + 1}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;">
          <strong style="color:#111827;font-size:12px;">${m.medicineName}</strong>
          <span style="color:#6b7280;font-size:11px;"> (${m.type})</span>
        </td>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:12px;">${m.frequency}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:12px;">${m.duration}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:12px;">${m.timing}${m.notes ? ` (${m.notes})` : ''}</td>
      </tr>`
    )
    .join('');

  const labTestsList = rx.labTests
    .map((t) => `<li style="margin-bottom:3px;color:#374151;font-size:12px;">${t.testName}${t.notes ? ` — ${t.notes}` : ''}</li>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; padding: 32px 36px; background: #fff; font-size: 12px; }
    .header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #1d6fa4; margin-bottom: 10px; }
    .clinic-name { font-size: 20px; font-weight: 700; color: #1d6fa4; }
    .clinic-sub { font-size: 11px; color: #6b7280; margin-top: 3px; }
    .doctor-line { font-size: 12px; color: #374151; margin-top: 4px; }
    .meta-row { text-align: right; font-size: 11px; color: #6b7280; margin-bottom: 10px; }
    .meta-row strong { color: #111827; }
    .meta-row .rx-id { color: #1d6fa4; font-weight: 700; }
    .patient-row { display: flex; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 8px 0; margin-bottom: 14px; gap: 0; }
    .patient-cell { flex: 1; padding-right: 12px; }
    .patient-cell:last-child { padding-right: 0; }
    .p-label { font-size: 9px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 2px; }
    .p-value { font-size: 13px; font-weight: 700; color: #111827; }
    .section-title { font-size: 11px; font-weight: 700; color: #1d6fa4; text-transform: uppercase; letter-spacing: 0.5px; margin: 12px 0 5px; }
    .plain-text { font-size: 12px; color: #374151; line-height: 1.5; margin-bottom: 2px; }
    .diagnosis-text { font-size: 12px; color: #374151; line-height: 1.5; padding: 6px 10px; background: #f0f9ff; border-left: 3px solid #1d6fa4; margin-bottom: 2px; }
    .advice-text { font-size: 12px; color: #374151; line-height: 1.5; padding: 6px 10px; background: #fffbeb; border-left: 3px solid #d97706; margin-bottom: 2px; }
    .followup-text { font-size: 12px; color: #dc2626; font-weight: 600; margin-top: 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 2px; }
    th { background: #1d6fa4; color: #fff; padding: 7px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; }
    th:first-child { width: 28px; }
    .sig-block { margin-top: 32px; text-align: right; }
    .sig-img { max-height: 56px; max-width: 160px; display: block; margin-left: auto; margin-bottom: 4px; }
    .sig-line { border-top: 1px solid #374151; display: inline-block; min-width: 160px; padding-top: 4px; text-align: right; }
    .sig-name { font-size: 12px; font-weight: 700; color: #111827; }
    .sig-reg { font-size: 10px; color: #6b7280; margin-top: 1px; }
    .footer { text-align: center; margin-top: 24px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #9ca3af; }
    .hash { font-family: monospace; font-size: 8px; color: #d1d5db; word-break: break-all; margin-top: 2px; }
    ul { padding-left: 18px; }
  </style>
</head>
<body>

  <div class="header">
    <div class="clinic-name">${clinicName}</div>
    ${clinicAddress || clinicPhone || clinicEmail ? `<div class="clinic-sub">${[clinicAddress, clinicPhone, clinicEmail].filter(Boolean).join(' | ')}</div>` : ''}
    <div class="doctor-line">${doctorLine}</div>
  </div>

  <div class="meta-row">
    Date: <strong>${dateStr}</strong> &nbsp;|&nbsp; ID: <span class="rx-id">${rx.id}</span>
  </div>

  <div class="patient-row">
    <div class="patient-cell">
      <div class="p-label">Patient</div>
      <div class="p-value">${rx.patientName}</div>
    </div>
    <div class="patient-cell">
      <div class="p-label">Age/Gender</div>
      <div class="p-value">${rx.patientAge} yrs / ${rx.patientGender}</div>
    </div>
    <div class="patient-cell">
      <div class="p-label">Phone</div>
      <div class="p-value">${rx.patientPhone || '—'}</div>
    </div>
  </div>

  ${rx.symptoms && rx.symptoms.length > 0 ? `
  <div class="section-title">Symptoms</div>
  <div class="plain-text">${rx.symptoms.join(', ')}</div>
  ` : ''}

  ${rx.diagnosis ? `
  <div class="section-title">Diagnosis</div>
  <div class="diagnosis-text">${rx.diagnosis}</div>
  ` : ''}

  ${rx.medicines.length > 0 ? `
  <div class="section-title">Medicines</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Medicine</th>
        <th>Dosage</th>
        <th>Duration</th>
        <th>Instructions</th>
      </tr>
    </thead>
    <tbody>${medicineRows}</tbody>
  </table>
  ` : ''}

  ${rx.labTests.length > 0 ? `
  <div class="section-title">Lab Tests / Investigations</div>
  <ul>${labTestsList}</ul>
  ` : ''}

  ${rx.advice ? `
  <div class="section-title">Advice</div>
  <div class="advice-text">${rx.advice}</div>
  ` : ''}

  ${rx.followUpDate ? `
  <div class="followup-text">Follow-up: ${new Date(rx.followUpDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
  ` : ''}

  <div class="sig-block">
    ${rx.signature && rx.signature.startsWith('M') ? `
      <svg width="160" height="56" viewBox="0 0 300 100" class="sig-img" style="display:block;margin-left:auto;margin-bottom:4px;">
        <path d="${rx.signature}" stroke="#111827" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    ` : rx.signature ? `
      <img src="${rx.signature}" class="sig-img" />
    ` : ''}
    <div class="sig-line">
      <div class="sig-name">Dr. ${doctorName}</div>
      ${doctorReg ? `<div class="sig-reg">Reg. No: ${doctorReg}</div>` : ''}
    </div>
  </div>

  ${clinicQrBase64 ? `
  <div style="margin-top:12px;">
    <img src="${clinicQrBase64}" style="height:60px;width:60px;" />
    <div style="font-size:9px;color:#9ca3af;margin-top:2px;">Scan for Payment / Details</div>
  </div>
  ` : ''}

  <div class="footer">
    <div>Generated by PrescoPad - Digital Prescription System</div>
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

  text += `_Generated by PrescoPad_`;
  return text;
}
