import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createUserWithEmailAndPassword, getIdTokenResult, onAuthStateChanged,
  signInWithEmailAndPassword, type User
} from 'firebase/auth';
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import { auth } from './firebase';
// Route-level splitting: loading the landing page must not download the admin
// dashboard or the authenticated workspace (and vice versa).
const Landing = React.lazy(() => import('./oppo/Landing'));
const Workspace = React.lazy(() => import('./workspace/Workspace'));
const AdminDashboard = React.lazy(() => import('./admin/AdminDashboard'));

type Page = 'home' | 'login' | 'register' | 'dashboard' | 'admin' | 'admin-login';
const pageFor = (path: string): Page => path === '/admin/login' ? 'admin-login' : path.startsWith('/admin') ? 'admin' : path.startsWith('/app') ? 'dashboard' : path === '/login' ? 'login' : path === '/register' ? 'register' : 'home';

function App() {
  const [page, setPage] = useState<Page>(() => pageFor(window.location.pathname));
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!auth) { setReady(true); return; }
    return onAuthStateChanged(auth, u => { setUser(u); setReady(true); },
      () => { setReady(true); setMessage('Authentication is unavailable. Try again later.'); });
  }, []);
  useEffect(() => {
    const handlePop = () => { setPage(pageFor(window.location.pathname)); setMessage(''); };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);
  const go = (next: Page) => {
    const path = next === 'dashboard' ? '/app/opportunities' : next === 'home' ? '/' : next === 'admin-login' ? '/admin/login' : '/' + next;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setPage(next); setMessage(''); window.scrollTo({ top: 0, behavior: 'auto' });
  };
  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth) { setMessage('Firebase Authentication has not been configured.'); return; }
    const values = new FormData(event.currentTarget);
    const email = String(values.get('email') || '').trim();
    const password = String(values.get('password') || '');
    if (!email || password.length < 6) { setMessage('Enter a valid email and a password of at least 6 characters.'); return; }
    setLoading(true); setMessage('');
    try {
      if (page === 'register') {
        await createUserWithEmailAndPassword(auth, email, password);
        go('dashboard');
      } else {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        if (page === 'admin-login') {
          const claims = await getIdTokenResult(credential.user, true);
          if (claims.claims.admin !== true) {
            setMessage('This Firebase account does not have administrator access. Sign in with the account granted the admin role.');
            return;
          }
          go('admin');
        } else go('dashboard');
      }
    } catch (error) {
      const code = String((error as { code?: string })?.code || '');
      setMessage(code === 'auth/email-already-in-use' ? 'That email is already registered. Log in instead.' :
        code === 'auth/weak-password' ? 'Choose a stronger password (at least 6 characters).' :
        code === 'auth/invalid-email' ? 'Enter a valid email address.' :
        code === 'auth/too-many-requests' ? 'Too many attempts. Please try again later.' :
        'We could not sign you in. Check your details and retry.');
    } finally { setLoading(false); }
  };

  if (page === 'home') return <Landing loggedIn={Boolean(user)} onLogin={() => go('login')} onGetStarted={() => go('register')} onDashboard={() => go('dashboard')}/>;
  if (page === 'admin') {
    if (!ready) return <div className="op-auth-page"><div className="op-auth-loading">Verifying administrator access…</div></div>;
    if (user) return <AdminDashboard user={user} onExit={() => go('home')} onWorkspace={() => go('dashboard')}/>;
    return <div className="op-auth-page"><div className="op-auth-card"><div className="op-auth-logo"><span>o.</span> OPPOTRON</div><h1>Administrator sign-in required.</h1><p>Sign in with a Firebase account that has the administrator custom claim to access this area.</p><button className="op-auth-back" onClick={() => go('admin-login')}>Administrator login <ArrowRight size={16}/></button></div></div>;
  }
  if (page === 'dashboard') {
    if (!ready) return <div className="op-auth-page"><div className="op-auth-loading">Opening your OPPOTRON workspace…</div></div>;
    if (user) return <Workspace user={user} onExit={() => go('home')}/>;
    return <div className="op-auth-page"><div className="op-auth-card"><div className="op-auth-logo"><span>o.</span> OPPOTRON</div><h1>Welcome to your workspace.</h1><p>Sign in to access your private fundraising administration, documents and opportunities.</p><button className="op-auth-back" onClick={() => go('login')}>Log in to OPPOTRON <ArrowRight size={16}/></button></div></div>;
  }
  return <main className="op-auth-page"><div className="op-auth-card">
    <div className="op-auth-logo"><span>o.</span> OPPOTRON</div>
    <div className="op-section-eyebrow"><span/> {page === 'admin-login' ? 'PLATFORM ADMINISTRATION' : page === 'login' ? 'WELCOME BACK' : 'START WITH OPPOTRON'}</div>
    <h1>{page === 'admin-login' ? 'Administrator sign in.' : page === 'login' ? 'Good to see you again.' : 'Your mission deserves a stronger back office.'}</h1>
    <p>{page === 'admin-login' ? 'Use the Firebase account with your administrator role. Access is verified securely after sign in.' : page === 'login' ? 'Access your nonprofit fundraising workspace and pick up where you left off.' : 'Create a private fundraising workspace for your nonprofit. View funding opportunities immediately after registration.'}</p>
    <form onSubmit={submitAuth}>
      <label>Email address<input autoComplete="email" required name="email" type="email" placeholder="you@organisation.co.za" maxLength={254}/></label>
      <label>Password<input autoComplete={page !== 'register' ? 'current-password' : 'new-password'} required name="password" type="password" minLength={6} placeholder={page !== 'register' ? 'Your password' : 'At least 6 characters'}/></label>
      <button type="submit" disabled={loading}>{loading ? 'Working…' : page === 'admin-login' ? 'Sign in to admin' : page === 'login' ? 'Log in' : 'Create my workspace'} <ArrowRight size={17}/></button>
    </form>
    {message && <div className="op-auth-error" role="alert">{message}</div>}
    {page === 'admin-login' ? <div className="op-auth-switch"><button onClick={() => go('login')}>Return to regular login</button></div> : <div className="op-auth-switch">{page === 'login' ? 'New to OPPOTRON?' : 'Already registered?'} <button onClick={() => go(page === 'login' ? 'register' : 'login')}>{page === 'login' ? 'Create an account' : 'Log in'}</button></div>}
    <button className="op-auth-back" onClick={() => go('home')}><ArrowLeft size={14}/> Back to OPPOTRON</button>
    {page === 'login' && <button className="op-admin-entry" onClick={() => go('admin-login')} aria-label="Administrator login"><ShieldCheck size={13}/> Admin access</button>}
  </div></main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><React.Suspense fallback={<div className="op-auth-page"><div className="op-auth-loading">Opening OPPOTRON…</div></div>}><App/></React.Suspense></React.StrictMode>);

// Retire any previously registered BUILDA app shell. OPPOTRON is web-first.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.filter(reg => reg.active?.scriptURL.endsWith('/sw.js')).forEach(reg => void reg.unregister());
    }).catch(() => {});
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('builda-shell-')).map(key => caches.delete(key)))).catch(() => {});
    }
  });
}
