declare module 'pdf-parse';
declare module 'mammoth';
interface ImportMetaEnv {
  readonly VITE_ENTRA_CLIENT_ID?: string;
  readonly VITE_ENTRA_TENANT_ID?: string;
  readonly VITE_APP_URL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }

declare global {
  interface Window {
    CLARITY_CONFIG?: {
      entraClientId?: string;
      entraTenantId?: string;
      appUrl?: string;
    };
  }
}
export {};
