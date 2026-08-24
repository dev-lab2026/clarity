import React, { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Copy, 
  Check, 
  LogOut, 
  User, 
  Briefcase, 
  Building, 
  Calendar, 
  RefreshCw, 
  Lock, 
  ShieldCheck, 
  Sparkles 
} from 'lucide-react';
import { MicrosoftUser } from '../types';

interface MicrosoftAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: MicrosoftUser | null;
  onLoginSuccess: (user: MicrosoftUser) => void;
  onLogout: () => void;
}

export const MicrosoftAuthModal: React.FC<MicrosoftAuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  onLogout,
}) => {
  const [loading, setLoading] = useState(false);
  const [copiedDev, setCopiedDev] = useState(false);
  const [copiedShared, setCopiedShared] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [configInfo, setConfigInfo] = useState<{
    devCallbackUrl: string;
    sharedCallbackUrl: string;
    isConfigured: boolean;
  } | null>(null);
  const [showConfigGuide, setShowConfigGuide] = useState(false);

  // Fetch Config Info
  useEffect(() => {
    if (isOpen) {
      fetch('/api/auth/config-info')
        .then((res) => res.json())
        .then((data) => setConfigInfo(data))
        .catch((err) => console.warn('Could not fetch auth config info', err));
    }
  }, [isOpen]);

  // Listen for postMessage from OAuth popup
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.user) {
        setLoading(false);
        setErrorMsg(null);
        onLoginSuccess(event.data.user);
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setLoading(false);
        setErrorMsg(event.data.error || 'Authentification Microsoft annulée ou échouée.');
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [onLoginSuccess]);

  if (!isOpen) return null;

  // Handle Real OAuth Popup
  const handleMicrosoftOAuthLogin = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. Fetch OAuth URL from backend with current origin
      const currentOrigin = window.location.origin;
      const res = await fetch(`/api/auth/microsoft/url?origin=${encodeURIComponent(currentOrigin)}`);
      const data = await res.json();

      if (!data.url) {
        // If credentials are not yet set in Azure / env, notify user and offer demo login
        setErrorMsg(
          data.message || 
          "MICROSOFT_CLIENT_ID non configuré. Vous pouvez utiliser le mode Démo M365 ou configurer les clés Azure."
        );
        setShowConfigGuide(true);
        setLoading(false);
        return;
      }

      // 2. Open provider authorize URL directly in popup
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        data.url,
        'microsoft_oauth_popup',
        `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=1`
      );

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        setErrorMsg('Veuillez autoriser les fenêtres pop-up pour vous connecter avec Microsoft.');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Failed to initiate Microsoft OAuth', err);
      setErrorMsg('Erreur de connexion au serveur d’authentification.');
      setLoading(false);
    }
  };

  // Handle Quick Demo M365 Login
  const handleDemoLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/microsoft/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Alexandre Dupont',
          email: 'alexandre.dupont@entreprise-m365.com',
          role: 'Chef de Projet Senior (PMP® & Agile)',
        }),
      });
      const data = await res.json();
      if (data.user) {
        onLoginSuccess(data.user);
      }
    } catch (err) {
      console.error('Demo login error', err);
      setErrorMsg('Erreur lors de la connexion démo.');
    } finally {
      setLoading(false);
    }
  };

  const devUrl = configInfo?.devCallbackUrl || `${window.location.origin}/auth/microsoft/callback`;
  const sharedUrl = configInfo?.sharedCallbackUrl || 'https://ais-pre-svan6exmhmzz3wdn5tz73n-385672579752.europe-west2.run.app/auth/microsoft/callback';

  const copyToClipboard = (text: string, isShared: boolean) => {
    navigator.clipboard.writeText(text);
    if (isShared) {
      setCopiedShared(true);
      setTimeout(() => setCopiedShared(false), 2000);
    } else {
      setCopiedDev(true);
      setTimeout(() => setCopiedDev(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header with Microsoft Branding */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            {/* Microsoft 4-Squares Icon */}
            <div className="grid grid-cols-2 gap-0.5 p-1.5 bg-white/10 rounded-lg">
              <span className="w-2.5 h-2.5 bg-[#f25022] rounded-[1px]" />
              <span className="w-2.5 h-2.5 bg-[#7fba00] rounded-[1px]" />
              <span className="w-2.5 h-2.5 bg-[#00a4ef] rounded-[1px]" />
              <span className="w-2.5 h-2.5 bg-[#ffb900] rounded-[1px]" />
            </div>
            <div>
              <h3 className="font-bold text-base tracking-tight flex items-center gap-2">
                Compte Microsoft 365 & Entra ID
              </h3>
              <p className="text-xs text-slate-400">Authentification unifiée Chef de Projet</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">

          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{errorMsg}</p>
                <p className="text-[11px] text-rose-600/90 mt-0.5">
                  Consultez le guide de configuration Azure Entra ID ci-dessous pour activer le SSO d'entreprise.
                </p>
              </div>
            </div>
          )}

          {/* User Profile View when Authenticated */}
          {currentUser ? (
            <div className="space-y-5">
              <div className="p-5 bg-gradient-to-br from-slate-50 to-indigo-50/40 rounded-2xl border border-indigo-100 flex items-start gap-4 shadow-xs">
                <div className="relative">
                  <img
                    src={currentUser.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.displayName)}`}
                    alt={currentUser.displayName}
                    className="w-14 h-14 rounded-full border-2 border-white shadow-sm object-cover bg-indigo-600"
                  />
                  <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-0.5 rounded-full ring-2 ring-white">
                    <Check className="w-3 h-3" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-slate-900 text-base truncate">
                      {currentUser.displayName}
                    </h4>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      Microsoft 365 Connecté
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 font-medium truncate mt-0.5">
                    {currentUser.email}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    {currentUser.jobTitle && (
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-slate-200">
                        <Briefcase className="w-3 h-3 text-slate-400" />
                        {currentUser.jobTitle}
                      </span>
                    )}
                    {currentUser.department && (
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-slate-200">
                        <Building className="w-3 h-3 text-slate-400" />
                        {currentUser.department}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Connected Services Box */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider">
                  Services Microsoft Liés à Clarity PM
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-slate-700">Profil & Annuaire Entra ID</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-slate-700">Synchronisation Outlook</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-slate-700">Tâches MS Planner & To-Do</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-slate-700">Rapports Flash COPIL M365</span>
                  </div>
                </div>
              </div>

              {/* Logout Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={onLogout}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer border border-rose-200"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Se déconnecter de Microsoft</span>
                </button>
              </div>
            </div>
          ) : (
            /* Login Form when Disconnected */
            <div className="space-y-5">
              <div className="text-center py-2">
                <div className="inline-flex p-3 bg-slate-100 rounded-2xl mb-3 border border-slate-200 shadow-inner">
                  <div className="grid grid-cols-2 gap-1">
                    <span className="w-4 h-4 bg-[#f25022] rounded-[2px]" />
                    <span className="w-4 h-4 bg-[#7fba00] rounded-[2px]" />
                    <span className="w-4 h-4 bg-[#00a4ef] rounded-[2px]" />
                    <span className="w-4 h-4 bg-[#ffb900] rounded-[2px]" />
                  </div>
                </div>
                <h4 className="text-lg font-bold text-slate-900">
                  Connectez votre espace de travail Microsoft
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                  Authentifiez-vous avec votre compte professionnel Microsoft Entra ID (Azure AD) ou compte Microsoft 365 pour gérer vos projets en toute sécurité.
                </p>
              </div>

              {/* Primary OAuth Button */}
              <button
                onClick={handleMicrosoftOAuthLogin}
                disabled={loading}
                className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-3 cursor-pointer hover:shadow-lg active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                ) : (
                  <div className="grid grid-cols-2 gap-0.5 shrink-0">
                    <span className="w-2 h-2 bg-[#f25022] rounded-[1px]" />
                    <span className="w-2 h-2 bg-[#7fba00] rounded-[1px]" />
                    <span className="w-2 h-2 bg-[#00a4ef] rounded-[1px]" />
                    <span className="w-2 h-2 bg-[#ffb900] rounded-[1px]" />
                  </div>
                )}
                <span>Se connecter avec Microsoft</span>
              </button>

              {/* Instant Demo Login Button */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Ou test rapide
                </span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <button
                onClick={handleDemoLogin}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Tester en mode Chef de Projet M365 (1-Clic)</span>
              </button>
            </div>
          )}

          {/* Toggle Azure Entra Configuration Guide */}
          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={() => setShowConfigGuide(!showConfigGuide)}
              className="text-xs font-semibold text-slate-600 hover:text-indigo-600 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{showConfigGuide ? 'Masquer le guide Azure Portal' : 'Guide de configuration Azure Entra ID / Microsoft OAuth'}</span>
            </button>

            {showConfigGuide && (
              <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-3">
                <p className="font-semibold text-slate-800">
                  📋 Étapes requises pour enregistrer l'application dans Azure Portal :
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
                  <li>
                    Ouvrez le portail Microsoft Azure :{' '}
                    <a
                      href="https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps"
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 underline font-medium inline-flex items-center gap-0.5"
                    >
                      Azure App Registrations <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                  <li>Cliquez sur <strong>Nouvelle inscription</strong> et choisissez les comptes pris en charge.</li>
                  <li>Sous <strong>URI de redirection (Plateforme Web)</strong>, ajoutez ces URLs exactes :</li>
                </ol>

                <div className="space-y-2 mt-2">
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase">
                        URL de redirection Développement (Preview)
                      </span>
                      <button
                        onClick={() => copyToClipboard(devUrl, false)}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        {copiedDev ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        {copiedDev ? 'Copié !' : 'Copier'}
                      </button>
                    </div>
                    <code className="block mt-1 font-mono text-[11px] text-slate-800 bg-slate-50 p-1.5 rounded break-all select-all">
                      {devUrl}
                    </code>
                  </div>

                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase">
                        URL de redirection Partagée / Déployée
                      </span>
                      <button
                        onClick={() => copyToClipboard(sharedUrl, true)}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        {copiedShared ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        {copiedShared ? 'Copié !' : 'Copier'}
                      </button>
                    </div>
                    <code className="block mt-1 font-mono text-[11px] text-slate-800 bg-slate-50 p-1.5 rounded break-all select-all">
                      {sharedUrl}
                    </code>
                  </div>
                </div>

                <div className="pt-2 text-[11px] text-slate-500 space-y-1">
                  <p>
                    4. Créez un <strong>Secret client</strong> dans Azure et configurez les variables dans AI Studio :
                  </p>
                  <ul className="list-disc list-inside pl-1 text-slate-700 font-mono text-[10px]">
                    <li>MICROSOFT_CLIENT_ID = "&lt;ID d'application (client)&gt;"</li>
                    <li>MICROSOFT_CLIENT_SECRET = "&lt;Valeur du secret client&gt;"</li>
                    <li>MICROSOFT_TENANT_ID = "common" (ou votre Tenant ID d'entreprise)</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-slate-400" /> Sécurité SSO OAuth 2.0 PKCE
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-semibold transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
