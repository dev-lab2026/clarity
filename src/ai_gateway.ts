import { routeAI, ensureAIRouterTable, listAIRouterAccounts, saveAIRouterAccount, deleteAIRouterAccount, type AIProvider } from './ai_router';

export async function ensureAIGatewayTable() { return ensureAIRouterTable(); }
export async function listProviderAccounts() { return listAIRouterAccounts(); }
export async function saveProviderAccount(input: any) { return saveAIRouterAccount(input); }
export async function deleteProviderAccount(id: number) { return deleteAIRouterAccount(id); }

export async function callGatewayText(params: {
  prompt: string; isJson?: boolean; model?: string; provider?: AIProvider; accountId?: number;
  task?: 'document'|'reasoning'|'coding'|'fast'|'chat';
}) {
  const result = await routeAI(params);
  if (!result) return null;
  return {
    text: result.text,
    provider: result.provider,
    model: result.model,
    accountId: result.accountId,
    accountName: result.accountName,
    // Backward-compatible shape used by the existing Copilot/admin code.
    account: { id: result.accountId, name: result.accountName, provider: result.provider, model: result.model },
    fallbackCount: result.fallbackCount,
  };
}
