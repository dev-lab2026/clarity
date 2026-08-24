import React, { useEffect, useState } from 'react';
import { AlertCircle, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { MicrosoftUser } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: MicrosoftUser) => void;
  currentUser?: MicrosoftUser | null;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [localAuthEnabled, setLocalAuthEnabled] = useState(false);
  const [adminEmailHint, setAdminEmailHint] = useState('admin@local');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    fetch('/api/auth/config-info')
      .then((r) => r.json())
      .then((d) => {
        setConfigured(Boolean(d.isConfigured));
        setDemoMode(Boolean(d.demoMode));
        setLocalAuthEnabled(Boolean(d.localAuthEnabled));
        if (d.localAdminEmail) setAdminEmailHint(d.localAdminEmail);
      })
      .catch(() => {
        setConfigured(false);
        setLocalAuthEnabled(false);
      });
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data.user) {
        setLoading(false);
        onLoginSuccess(event.data.user);
      }
      if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setLoading(false);
        setErrorMsg(event.data.error || 'Authentification Microsoft échouée.');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onLoginSuccess]);

  const loginLocal = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/login-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Connexion locale impossible.');
      onLoginSuccess(data.user);
    } catch (e: any) {
      setErrorMsg(e.message || 'Connexion locale impossible.');
    } finally {
      setLoading(false);
    }
  };

  const loginMicrosoft = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/auth/microsoft/url?origin=${encodeURIComponent(window.location.origin)}`);
      const data = await res.json();
      if (!data.url) {
        setErrorMsg(data.message || 'Microsoft Entra ID n’est pas configuré.');
        setLoading(false);
        return;
      }
      const popup = window.open(
        data.url,
        'microsoft_oauth_popup',
        'width=600,height=700,scrollbars=yes,status=1',
      );
      if (!popup) {
        setErrorMsg('Veuillez autoriser les fenêtres pop-up.');
        setLoading(false);
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('Erreur de communication avec le serveur OAuth.');
      setLoading(false);
    }
  };

  const demoLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/microsoft/demo-login', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onLoginSuccess(data.user);
    } catch (e: any) {
      setErrorMsg(e.message || 'Mode démo indisponible.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-6 text-slate-800">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-lg p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black">CPM</div>
          <div>
            <div className="text-xl font-black">CLARITY <span className="text-indigo-600">PM</span></div>
            <div className="text-xs text-slate-500">Cockpit de gestion de projets</div>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {localAuthEnabled && (
          <form onSubmit={loginLocal} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              Accès administrateur local
            </div>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={adminEmailHint}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe administrateur"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Se connecter comme administrateur</span>}
            </button>
            <p className="text-[11px] text-slate-500">
              Ce compte local sert à initialiser CLARITY PM. Entra ID reste disponible en parallèle.
            </p>
          </form>
        )}

        {localAuthEnabled && configured && <div className="flex items-center gap-3 text-[11px] text-slate-400"><span className="h-px bg-slate-200 flex-1" /> OU <span className="h-px bg-slate-200 flex-1" /></div>}

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" />
            <div>
              <div className="font-bold text-sm">Microsoft Entra ID</div>
              <p className="text-xs text-slate-600 mt-1">La connexion Microsoft est déléguée à Microsoft Entra ID. Le mot de passe Microsoft ne transite jamais par CLARITY PM.</p>
            </div>
          </div>
        </div>

        <button
          onClick={loginMicrosoft}
          disabled={loading || configured === false}
          className="w-full py-3 px-4 bg-[#0067b8] hover:bg-[#005da6] text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Se connecter avec Microsoft Entra ID</span>}
        </button>

        {demoMode && (
          <button onClick={demoLogin} disabled={loading} className="w-full py-2.5 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg text-xs font-semibold">
            Accéder au mode démo
          </button>
        )}

        {configured === false && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Entra ID n’est pas encore configuré. Vous pouvez utiliser le compte administrateur local puis configurer Entra ID depuis l’administration.
          </p>
        )}
      </div>
    </div>
  );
};
