import { create } from 'zustand';
import * as FileSystem from 'expo-file-system';
import SecureStore from '../utils/secureStore';
import { Clinic, DoctorProfile } from '../types/clinic.types';
import api from '../services/api';
import { useAuthStore } from './useAuthStore';

const SIG_FILE_URI = `${FileSystem.documentDirectory}doctor_signature.svg`;

async function writeSigFile(content: string): Promise<string> {
  await FileSystem.writeAsStringAsync(SIG_FILE_URI, content, { encoding: FileSystem.EncodingType.UTF8 });
  return SIG_FILE_URI;
}

async function readSigFile(uri: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  } catch {
    return null;
  }
}

interface ClinicStore {
  clinic: Clinic | null;
  doctorProfile: DoctorProfile | null;
  isLoading: boolean;

  loadClinic: () => Promise<void>;
  loadDoctorProfile: () => Promise<void>;
  updateClinic: (data: Partial<Clinic>) => Promise<void>;
  updateDoctorProfile: (data: Partial<DoctorProfile>) => Promise<void>;
  saveSignature: (signatureBase64: string) => Promise<void>;
  setClinic: (clinic: Clinic) => void;
  setDoctorProfile: (profile: DoctorProfile) => void;
}

export const useClinicStore = create<ClinicStore>((set, get) => ({
  clinic: null,
  doctorProfile: null,
  isLoading: false,

  loadClinic: async () => {
    try {
      const res = await api.get('/clinic');
      const c = res.data.clinic;
      if (c) {
        set({
          clinic: {
            id: c.id,
            name: c.name || '',
            address: c.address || '',
            phone: c.phone || '',
            email: c.email || '',
            logoBase64: c.logo_url || c.logoBase64 || null,
            ownerId: c.owner_id || '',
          },
        });
      }
    } catch {
      // no clinic yet
    }
  },

  loadDoctorProfile: async () => {
    try {
      const authUser = useAuthStore.getState().user;
      if (!authUser) return;

      if (authUser.role === 'doctor') {
        const res = await api.get('/auth/me');
        const u = res.data.user;
        const localRef = await SecureStore.getItemAsync('doctorSignature');
        // localRef may be a file:// URI (new) or a raw SVG path (legacy)
        let localSig: string | null = null;
        if (localRef) {
          localSig = localRef.startsWith('file://') ? await readSigFile(localRef) : localRef;
        }
        // Fall back to cloud-stored signature if local cache is missing
        const cloudSig = u?.signature_url || u?.signatureUrl || null;
        const signatureBase64 = localSig || cloudSig;
        if (u) {
          set({
            doctorProfile: {
              id: u.id,
              name: u.name || '',
              phone: u.phone || '',
              specialty: u.specialty || '',
              regNumber: u.reg_number || u.regNumber || '',
              signatureBase64: signatureBase64 || null,
              cloudId: u.id,
            },
          });
        }
      } else if (authUser.role === 'assistant') {
        if (!authUser.clinicId) return;
        const res = await api.get(`/clinic/${authUser.clinicId}/doctors`);
        const doctors = res.data.doctors ?? [];
        if (doctors.length > 0) {
          const doc = doctors[0];
          set({
            doctorProfile: {
              id: doc.id,
              name: doc.name || '',
              phone: doc.phone || '',
              specialty: doc.specialty || '',
              regNumber: doc.regNumber || doc.reg_number || '',
              signatureBase64: doc.signatureUrl || doc.signature_url || doc.signature || null,
              cloudId: doc.id,
            },
          });
        }
      }
    } catch {
      // failed to load doctor profile
    }
  },

  updateClinic: async (data) => {
    const current = get().clinic;
    if (!current) return;

    const payload: Record<string, unknown> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.address !== undefined) payload.address = data.address;
    if (data.phone !== undefined) payload.phone = data.phone;
    if (data.email !== undefined) payload.email = data.email;
    if (data.logoBase64 !== undefined) payload.logo_url = data.logoBase64;

    await api.put('/clinic', payload);
    set({ clinic: { ...current, ...data } });
  },

  updateDoctorProfile: async (data) => {
    const current = get().doctorProfile;
    if (!current) return;

    // Update cloud fields (name, specialty, regNumber)
    const payload: Record<string, unknown> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.specialty !== undefined) payload.specialty = data.specialty;
    if (data.regNumber !== undefined) payload.regNumber = data.regNumber;

    if (Object.keys(payload).length > 0) {
      await api.put('/auth/profile', payload);
    }

    // Save signature: write to filesystem (no size limit), store URI in SecureStore, sync to cloud
    if (data.signatureBase64 !== undefined) {
      if (data.signatureBase64) {
        const fileUri = await writeSigFile(data.signatureBase64);
        await SecureStore.setItemAsync('doctorSignature', fileUri);
        await api.put('/auth/profile', { signatureUrl: data.signatureBase64 });
      } else {
        await SecureStore.deleteItemAsync('doctorSignature');
        try { await FileSystem.deleteAsync(SIG_FILE_URI, { idempotent: true }); } catch {}
        await api.put('/auth/profile', { signatureUrl: '' });
      }
    }

    set({ doctorProfile: { ...current, ...data } });
  },

  saveSignature: async (signatureBase64: string) => {
    const current = get().doctorProfile;
    if (!current) return;
    const fileUri = await writeSigFile(signatureBase64);
    await SecureStore.setItemAsync('doctorSignature', fileUri);
    await api.put('/auth/profile', { signatureUrl: signatureBase64 });
    set({ doctorProfile: { ...current, signatureBase64 } });
  },

  setClinic: (clinic) => set({ clinic }),
  setDoctorProfile: (profile) => set({ doctorProfile: profile }),
}));
