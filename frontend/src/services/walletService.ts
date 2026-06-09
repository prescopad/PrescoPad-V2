import api from './api';
import { Transaction } from '../types/wallet.types';

export async function fetchWalletBalance(): Promise<number> {
  const response = await api.get('/wallet');
  return response.data.wallet.balance;
}

export async function rechargeWallet(amount: number): Promise<{
  balance: number;
  transactionId: string;
}> {
  const response = await api.post('/wallet/recharge', { amount });
  const wallet = response.data.wallet ?? {};
  return {
    balance: wallet.balance ?? response.data.balance ?? 0,
    transactionId: response.data.transactionId ?? '',
  };
}

export async function deductWallet(
  amount: number,
  description: string,
  referenceId: string
): Promise<{ balance: number; transactionId: string }> {
  const response = await api.post('/wallet/deduct', {
    amount,
    description,
    referenceId,
  });
  const wallet = response.data.wallet ?? {};
  return {
    balance: wallet.balance ?? response.data.balance ?? 0,
    transactionId: response.data.transactionId ?? '',
  };
}

function normalizeTransaction(t: Record<string, unknown>): Transaction {
  return {
    id: (t.id ?? t._id ?? '') as string,
    walletId: (t.wallet_id ?? t.walletId ?? '') as string,
    type: (t.type ?? '') as Transaction['type'],
    amount: (t.amount ?? 0) as number,
    description: (t.description ?? '') as string,
    referenceId: (t.reference_id ?? t.referenceId ?? '') as string,
    createdAt: (t.created_at ?? t.createdAt ?? '') as string,
  };
}

export async function fetchTransactions(
  limit = 50,
  offset = 0
): Promise<Transaction[]> {
  const response = await api.get('/wallet/transactions', {
    params: { limit, offset },
  });
  const raw: Record<string, unknown>[] = response.data.transactions ?? [];
  return raw.map(normalizeTransaction);
}

export async function recordConsultationPayment(
  prescriptionId: string,
  amount: number,
  method: 'cash' | 'online',
): Promise<void> {
  await api.post('/wallet/record-payment', { prescriptionId, amount, method });
}

export async function updateAutoRefill(
  autoRefill: boolean,
  autoRefillAmount?: number,
  autoRefillThreshold?: number
): Promise<void> {
  await api.put('/wallet/auto-refill', {
    autoRefill,
    autoRefillAmount,
    autoRefillThreshold,
  });
}
