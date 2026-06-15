export enum PrescriptionStatus {
  DRAFT = 'draft',
  FINALIZED = 'finalized',
}

export interface PrescriptionMedicine {
  id: string;
  prescriptionId: string;
  medicineName: string;
  type: string;
  dosage: string;
  frequency: string;
  duration: string;
  timing: string;
  notes: string;
}

export interface PrescriptionLabTest {
  id: string;
  prescriptionId: string;
  testName: string;
  category: string;
  notes: string;
}

export interface Vitals {
  bp?: string;
  pulse?: string;
  temperature?: string;
  spO2?: string;
  weight?: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  patientPhone: string;
  doctorId: string;
  doctorName?: string; // Doctor's name from JOIN
  chiefComplaint?: string;
  diagnosis: string;
  advice: string;
  followUpDate: string | null;
  symptoms: string[];
  vitals?: Vitals;
  pdfPath: string | null;
  pdfHash: string | null;
  signature: string | null;
  status: PrescriptionStatus;
  walletDeducted: boolean;
  medicines: PrescriptionMedicine[];
  labTests: PrescriptionLabTest[];
  createdAt: string;
}

export interface PrescriptionDraft {
  patientId: string;
  patientName: string;
  patientAge: string;
  patientGender: string;
  patientWeight: string;
  patientPhone: string;
  chiefComplaint: string;
  diagnosis: string;
  advice: string;
  followUpDate: string;
  symptoms: string[];
  vitals: Vitals;
  medicines: Omit<PrescriptionMedicine, 'id' | 'prescriptionId'>[];
  labTests: Omit<PrescriptionLabTest, 'id' | 'prescriptionId'>[];
}

export interface PrescriptionTemplate {
  id: string;
  name: string;
  chiefComplaint?: string;
  diagnosis: string;
  advice: string;
  symptoms: string[];
  medicines: Omit<PrescriptionMedicine, 'id' | 'prescriptionId'>[];
  labTests: Omit<PrescriptionLabTest, 'id' | 'prescriptionId'>[];
  createdAt: string;
}
