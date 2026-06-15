import { create } from 'zustand';
import {
  Prescription,
  PrescriptionDraft,
  PrescriptionMedicine,
  PrescriptionLabTest,
  PrescriptionTemplate,
} from '../types/prescription.types';
import * as DataService from '../services/dataService';

type MedicineDraft = Omit<PrescriptionMedicine, 'id' | 'prescriptionId'>;
type LabTestDraft = Omit<PrescriptionLabTest, 'id' | 'prescriptionId'>;

interface PrescriptionStore {
  currentDraft: PrescriptionDraft;
  currentPrescription: Prescription | null;
  recentPrescriptions: Prescription[];
  templates: PrescriptionTemplate[];
  isLoading: boolean;
  queueItemId: string | null;

  // Draft management
  updateDraft: (partial: Partial<PrescriptionDraft>) => void;
  addMedicine: (med: MedicineDraft) => void;
  removeMedicine: (index: number) => void;
  addLabTest: (test: LabTestDraft) => void;
  removeLabTest: (index: number) => void;
  resetDraft: () => void;
  setQueueItemId: (id: string | null) => void;

  // Prescription lifecycle
  createPrescription: (doctorId: string) => Promise<Prescription>;
  finalizePrescription: (id: string, signature: string, pdfPath: string, pdfHash: string) => Promise<void>;
  loadRecentPrescriptions: () => Promise<void>;
  loadPrescription: (id: string) => Promise<Prescription | null>;
  getTodayCount: () => Promise<number>;

  // Templates
  loadTemplates: () => Promise<void>;
  saveTemplate: (name: string) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  applyTemplate: (template: PrescriptionTemplate) => void;
}

const emptyDraft: PrescriptionDraft = {
  patientId: '',
  patientName: '',
  patientAge: '',
  patientGender: '',
  patientWeight: '',
  patientPhone: '',

  diagnosis: '',
  advice: '',
  followUpDate: '',
  symptoms: [],

  medicines: [],
  labTests: [],
};

export const usePrescriptionStore = create<PrescriptionStore>((set, get) => ({
  currentDraft: { ...emptyDraft },
  currentPrescription: null,
  recentPrescriptions: [],
  templates: [],
  isLoading: false,
  queueItemId: null,

  updateDraft: (partial) => {
    set((state) => ({
      currentDraft: { ...state.currentDraft, ...partial },
    }));
  },

  addMedicine: (med) => {
    set((state) => ({
      currentDraft: {
        ...state.currentDraft,
        medicines: [...state.currentDraft.medicines, med],
      },
    }));
  },

  removeMedicine: (index) => {
    set((state) => ({
      currentDraft: {
        ...state.currentDraft,
        medicines: state.currentDraft.medicines.filter((_, i) => i !== index),
      },
    }));
  },

  addLabTest: (test) => {
    set((state) => ({
      currentDraft: {
        ...state.currentDraft,
        labTests: [...state.currentDraft.labTests, test],
      },
    }));
  },

  removeLabTest: (index) => {
    set((state) => ({
      currentDraft: {
        ...state.currentDraft,
        labTests: state.currentDraft.labTests.filter((_, i) => i !== index),
      },
    }));
  },

  resetDraft: () => set({
    currentDraft: { ...emptyDraft },
    currentPrescription: null,
    queueItemId: null,
  }),

  setQueueItemId: (id) => set({ queueItemId: id }),

  createPrescription: async (doctorId) => {
    set({ isLoading: true });
    try {
      const prescription = await DataService.createPrescription(get().currentDraft, doctorId);
      set({ currentPrescription: prescription, isLoading: false });
      return prescription;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  finalizePrescription: async (id, signature, _pdfPath, pdfHash) => {
    await DataService.finalizePrescription(id, signature, pdfHash);
    const updated = await DataService.getPrescriptionById(id);
    set({ currentPrescription: updated });
  },

  loadRecentPrescriptions: async () => {
    set({ isLoading: true });
    try {
      const recentPrescriptions = await DataService.getRecentPrescriptions();
      set({ recentPrescriptions, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  loadPrescription: async (id) => {
    const prescription = await DataService.getPrescriptionById(id);
    set({ currentPrescription: prescription });
    return prescription;
  },

  getTodayCount: async () => {
    return DataService.getTodayPrescriptionCount();
  },

  loadTemplates: async () => {
    try {
      const templates = await DataService.getPrescriptionTemplates();
      set({ templates });
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  },

  saveTemplate: async (name) => {
    try {
      const draft = get().currentDraft;
      const newTemplate = await DataService.savePrescriptionTemplate({
        name,

        diagnosis: draft.diagnosis,
        advice: draft.advice,
        symptoms: draft.symptoms,
        medicines: draft.medicines,
        labTests: draft.labTests,
      });
      set((state) => ({ templates: [...state.templates, newTemplate] }));
    } catch (error) {
      console.error('Failed to save template:', error);
      throw error;
    }
  },

  deleteTemplate: async (id) => {
    try {
      await DataService.deletePrescriptionTemplate(id);
      set((state) => ({
        templates: state.templates.filter((t) => t.id !== id),
      }));
    } catch (error) {
      console.error('Failed to delete template:', error);
      throw error;
    }
  },

  applyTemplate: (template) => {
    set((state) => ({
      currentDraft: {
        ...state.currentDraft,
        diagnosis: template.diagnosis || state.currentDraft.diagnosis,
        advice: template.advice || state.currentDraft.advice,
        symptoms: [...new Set([...state.currentDraft.symptoms, ...template.symptoms])],
        medicines: [...state.currentDraft.medicines, ...template.medicines],
        labTests: [...state.currentDraft.labTests, ...template.labTests],
      },
    }));
  },
}));
