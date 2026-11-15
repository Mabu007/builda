import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, BookOpenText, Bot,
  BriefcaseBusiness, Building2, Check, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, Clock3, CloudUpload, ExternalLink, FileCheck2, FileText, Filter,
  FolderOpen, LayoutDashboard, LockKeyhole, LogOut, Menu, Moon, Sun, Download, MoreHorizontal,
  RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Star, Trash2, X
} from 'lucide-react';
import { auth, db } from '../firebase';
import { matchTender, hasMatchingProfile } from './matching';
import DocumentVault from './DocumentVault';
import AssistantHub from './AssistantHub';
import OrganisationOnboarding from './OrganisationOnboarding';
import type { OrganisationType } from './OrganisationOnboarding';
import type { VaultFile } from './DocumentVault';
import './workspace.css';

type View = 'overview' | 'tenders' | 'saved' | 'documents' | 'company' | 'settings' | 'assistant';
type Tender = {
  id: string; reference: string; title: string; description: string; buyer: string; province: string;
  category: string; status: string; publishedAt: string; closesAt: string;
  eligibility: string; specialConditions: string; submission: string;
  briefing: { date: string; venue: string; compulsory: boolean } | null;
  documents: { title: string; url: string }[]; value: number | null; currency: string;
  source: string; sourceUrl: string;
};
type Company = Record<string, string>;
type Model = { id: string; name: string; promptPrice?: number; completionPrice?: number };
type Theme = 'light' | 'dark';
const allProvinces = ['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West'];
const categories = ['Construction & Civil Engineering', 'Electrical & Plumbing', 'Facilities Management', 'Cleaning & Hygiene', 'Security Services', 'Information Technology', 'Software & Digital Services', 'Consulting & Professional Services', 'Logistics & Transport', 'Catering & Hospitality', 'Education & Training', 'Healthcare & Medical Supply', 'Agriculture', 'Manufacturing & Supply', 'Marketing & Media', 'Nonprofit & Social Services', 'Other'];
const profileKeys = ['name', 'registration', 'phone', 'description', 'category', 'province', 'city', 'coverage', 'services', 'experience', 'projects'];
const safeDate = (date: string | undefined) => { const d = new Date(date || ''); return !Number.isNaN(d.getTime()) ? d : null; };
const formattedDate = (date: string | undefined) => safeDate(date)?.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) || 'Not specified';
const formatSize = (n: number) => n < 1024 * 1024 ? (n / 1024).toFixed(0) + ' KB' : (n / (1024 * 1024)).toFixed(1) + ' MB';
const tenderStatus = (t: Tender) => {
  const status = t.status.toLowerCase();
  if (/cancel|withdraw/.test(status)) return 'Cancelled';
  if (/complete|closed|unsuccessful|award|terminated/.test(status)) return 'Closed';
  const close = safeDate(t.closesAt);
  if (close && close.getTime() < Date.now()) return 'Closed';
  return close ? 'Open' : 'Check notice';
};
const daysUntil = (date: string) => { const d = safeDate(date); return d ? Math.ceil((d.getTime() - Date.now()) / 86400000) : null; };
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
async function api<T>(user: User, path: string, options: RequestInit = {}): Promise<T> {
  const token = await user.getIdToken();
  const result = await fetch(path, { ...options, headers: { Authorization: 'Bearer ' + token, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const body = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(body.error || 'Request failed. Please try again.');
  return body as T;
}
function IconWrap({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={'bo-icon bo-icon-' + tone}>{children}</span>;
}
function Empty({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return <div className="bo-empty"><div className="bo-empty-icon">{icon}</div><strong>{title}</strong><p>{body}</p>{action}</div>;
}
function Status({ value }: { value: string }) { return <span className={'bo-status ' + (value === 'Open' ? 'bo-status-open' : value === 'Closed' || value === 'Cancelled' ? 'bo-status-closed' : 'bo-status-verify')}><span />{value}</span>; }
export default function Workspace({ user, onExit }: { user: User; onExit: () => void }) {
  const fromPath = window.location.pathname.replace(/^\/app\/?/, '').split('/')[0];
  const [view, setView] = useState<View>(['overview', 'tenders', 'saved', 'documents', 'company', 'settings', 'assistant'].includes(fromPath) ? fromPath as View : 'overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<Company>({});
  const [draft, setDraft] = useState<Company>({});
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [notice, setNotice] = useState('');
  const [vaultError, setVaultError] = useState('');
  const [vaultLoading, setVaultLoading] = useState(true);
  const [savedError, setSavedError] = useState('');
  const [theme, setTheme] = useState<Theme>(() => {
    try { const saved = localStorage.getItem('oppotron-theme'); if (saved === 'dark' || saved === 'light') return saved; }
    catch { /* storage unavailable */ }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [feedPage, setFeedPage] = useState(1);
  const [more, setMore] = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [feedUpdated, setFeedUpdated] = useState('');
  const [saved, setSaved] = useState<Tender[]>([]);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [search, setSearch] = useState('');
  const [province, setProvince] = useState('');
  const [stateFilter, setStateFilter] = useState<'open' | 'all'>('open');
  const [matchOnly, setMatchOnly] = useState(true);
  const [selected, setSelected] = useState<Tender | null>(null);
  const [assistantTender, setAssistantTender] = useState<Tender | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [model, setModel] = useState('openrouter/free');
  const [models, setModels] = useState<Model[]>([{ id: 'openrouter/free', name: 'Free auto · OpenRouter' }]);
  const [modelSaving, setModelSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedRequestId = useRef(0);

  useEffect(() => {
    try { localStorage.setItem('oppotron-theme', theme); } catch { /* privacy settings */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101b20' : '#f6f8f7');
  }, [theme]);
  const changeView = (next: View) => {
    setView(next); setSidebarOpen(false); setNotice('');
    if (next !== 'assistant') setAssistantTender(null);
    const path = next === 'overview' ? '/app' : '/app/' + next;
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  useEffect(() => {
    const onBack = () => {
      const next = window.location.pathname.replace(/^\/app\/?/, '').split('/')[0];
      if (['overview', 'tenders', 'saved', 'documents', 'company', 'settings', 'assistant'].includes(next)) setView(next as View);
      else if (window.location.pathname === '/app' || window.location.pathname === '/app/') setView('overview');
      setSelected(null); setSidebarOpen(false);
    };
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, []);
  useEffect(() => {
    if (!db) { setProfileError('Firebase is not configured. Check the project settings.'); setVaultError('Firebase is not configured.'); setVaultLoading(false); setProfileLoading(false); return; }
    let active = true;
    getDoc(doc(db, 'contractors', user.uid)).then(snap => {
      if (!active) return;
      const item = snap.exists() ? snap.data() as Company : {};
      setProfile(item); setDraft(item); setProfileError(''); setProfileLoading(false);
    }).catch(() => {
      if (active) { setProfileError('Could not access Firestore. Confirm the database exists and the deployed security rules permit this account.'); setProfileLoading(false); }
    });
    getDoc(doc(db, 'contractors', user.uid, 'settings', 'preferences')).then(snap => {
      if (active && snap.exists() && typeof snap.data().model === 'string') setModel(snap.data().model);
    }).catch(() => {});
    const unwatchFiles = onSnapshot(collection(db, 'contractors', user.uid, 'documents'), snap => {
      if (active) { setVaultError(''); setVaultLoading(false); setFiles(snap.docs.map(s => ({ ...s.data(), id: s.id } as VaultFile)).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))); }
    }, () => { if (active) { setVaultLoading(false); setVaultError('Document metadata is unavailable. No files were deleted. Verify Firestore access, then reload.'); } });
    const unwatchSaved = onSnapshot(collection(db, 'contractors', user.uid, 'savedTenders'), snap => {
      if (active) { setSavedError(''); setSaved(snap.docs.map(s => s.data() as Tender)); }
    }, () => { if (active) setSavedError('Saved tenders are temporarily unavailable. Check Firestore access, then reload.'); });
    return () => { active = false; unwatchFiles(); unwatchSaved(); };
  }, [user.uid]);
  const loadTenders = async (page: number, replace: boolean) => {
    const requestId = ++feedRequestId.current;
    try {
      if (replace) { setFeedLoading(true); setFeedError(''); } else setFetchingMore(true);
      const response = await api<{ items: Tender[]; hasMore: boolean; updatedAt: string }>(user, '/api/tenders?page=' + page);
      if (requestId !== feedRequestId.current) return;
      setTenders(old => replace ? response.items : [...new Map([...old, ...response.items].map(t => [t.id, t])).values()]);
      setMore(response.hasMore); setFeedPage(page); setFeedUpdated(response.updatedAt);
    } catch (error) { if (requestId === feedRequestId.current) setFeedError(error instanceof Error ? error.message : 'Unable to retrieve government tenders.'); }
    finally { setFeedLoading(false); setFetchingMore(false); }
  };
  useEffect(() => { void loadTenders(1, true); }, [user.uid]);
  useEffect(() => {
    if (view !== 'settings') return;
    api<{ models: Model[] }>(user, '/api/models').then(r => { if (r.models.length) setModels(r.models); }).catch(() => {});
  }, [view, user.uid]);
  const savedIds = useMemo(() => new Set(saved.map(t => t.id)), [saved]);
  const profileReady = hasMatchingProfile(profile);
  const rankedTenders = useMemo(() => tenders.map(t => ({ tender: t, match: matchTender(t, profile) })), [tenders, profile]);
  const matchMap = useMemo(() => new Map(rankedTenders.map(entry => [entry.tender.id, entry.match])), [rankedTenders]);
  const matchedCount = rankedTenders.filter(entry => tenderStatus(entry.tender) === 'Open' && entry.match.score >= 52).length;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenders.filter(t => {
      if (stateFilter === 'open' && tenderStatus(t) !== 'Open') return false;
      if (province && !t.province.toLowerCase().includes(province.toLowerCase())) return false;
      if (matchOnly && profileReady && (matchMap.get(t.id)?.score ?? 0) < 52) return false;
      return !q || [t.title, t.reference, t.buyer, t.province, t.description].some(s => s?.toLowerCase().includes(q));
    }).sort((a, b) => {
      if (profileReady) { const difference = (matchMap.get(b.id)?.score ?? 0) - (matchMap.get(a.id)?.score ?? 0); if (difference) return difference; }
      return (safeDate(a.closesAt)?.getTime() || Number.MAX_SAFE_INTEGER) - (safeDate(b.closesAt)?.getTime() || Number.MAX_SAFE_INTEGER);
    });
  }, [tenders, stateFilter, search, province, matchOnly, profileReady, matchMap]);
  const relevantCount = tenders.filter(t => tenderStatus(t) === 'Open').length;
  const isNpo = profile.organizationType === 'npo';
  const requiredKeys = isNpo ? profileKeys.filter(k => !['registration', 'experience'].includes(k)) : profileKeys;
  const profileCompleted = requiredKeys.filter(k => profile[k]?.trim()).length;
  const profilePct = Math.round(profileCompleted / requiredKeys.length * 100);
  const companyName = profile.tradingName || profile.name || 'Your organisation';
  const savedNext = saved.filter(t => tenderStatus(t) === 'Open').sort((a,b) => (safeDate(a.closesAt)?.getTime() || Infinity) - (safeDate(b.closesAt)?.getTime() || Infinity))[0];
  const expirySoon = files.filter(f => f.expiresAt && daysUntil(f.expiresAt) !== null && (daysUntil(f.expiresAt) as number) <= 30);
  const showTender = (t: Tender) => { setSelected(t); setAnalysis(''); setAiError(''); };

  const saveCompany = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!db || !draft.name?.trim()) { setProfileError('An organisation name is required.'); return; }
    setProfileSaving(true); setProfileError('');
    try {
      const record = Object.fromEntries(Object.entries(draft).filter(([key]) => [...profileKeys, 'tradingName', 'contactPerson', 'whatsapp', 'goals'].includes(key)).map(([key, val]) => [key, String(val || '').slice(0, 4000)]));
      await setDoc(doc(db, 'contractors', user.uid), { ...record, organizationType: profile.organizationType || 'business', ownerId: user.uid, email: user.email || '', updatedAt: serverTimestamp() }, { merge: true });
      setProfile(prev => ({ ...prev, ...record })); setNotice('Organisation profile saved. Your matching will improve.');
    } catch { setProfileError('Unable to save. Check your Firestore permissions and try again.'); }
    finally { setProfileSaving(false); }
  };
  const chooseOrganisation = async (type: OrganisationType) => {
    if (!db) throw new Error('Firestore is not configured.');
    await setDoc(doc(db, 'contractors', user.uid), {
      organizationType: type, ownerId: user.uid, email: user.email || '', updatedAt: serverTimestamp()
    }, { merge: true });
    setProfile(prev => ({ ...prev, organizationType: type }));
    setDraft(prev => ({ ...prev, organizationType: type }));
    changeView('company');
    setNotice('Your ' + (type === 'npo' ? 'nonprofit' : 'business') + ' workspace is ready. Complete your profile to improve matching.');
  };
  const openAssistantFor = (t: Tender) => {
    setAssistantTender(t); setSelected(null); changeView('assistant');
  };
  const toggleSaved = async (t: Tender) => {
    if (!db) return;
    try {
      const ref = doc(db, 'contractors', user.uid, 'savedTenders', encodeURIComponent(t.id));
      if (savedIds.has(t.id)) await deleteDoc(ref);
      else await setDoc(ref, { ...t, ownerId: user.uid, savedAt: serverTimestamp() });
      setNotice(savedIds.has(t.id) ? 'Removed from saved opportunities.' : 'Tender saved to your workspace.');
    } catch { setNotice('Could not update saved tenders. Check Firestore permissions.'); }
  };
  const explain = async (t: Tender) => {
    setAnalysing(true); setAiError(''); setAnalysis('');
    try { const result = await api<{ answer: string }>(user, '/api/ai', { method: 'POST', body: JSON.stringify({ model, tender: t, company: profile }) }); setAnalysis(result.answer); }
    catch (err) { setAiError(err instanceof Error ? err.message : 'The explanation could not be generated.'); }
    finally { setAnalysing(false); }
  };
  const saveModel = async () => {
    if (!db) return;
    setModelSaving(true);
    try { await setDoc(doc(db, 'contractors', user.uid, 'settings', 'preferences'), { model, updatedAt: serverTimestamp() }, { merge: true }); setNotice('AI model preference saved.'); }
    catch { setNotice('Model preference could not be saved. Check Firestore rules.'); }
    finally { setModelSaving(false); }
  };
  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selected]);
  const leave = async () => { try { if (auth) await signOut(auth); onExit(); } catch { setNotice('Could not sign out. Try again.'); } };
  const nav: { label: string; items: { id: View; label: string; icon: React.ReactNode }[] }[] = [
    { label: 'WORKSPACE', items: [
      { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18}/> },
      { id: 'tenders', label: 'Opportunities', icon: <BriefcaseBusiness size={18}/> },
      { id: 'assistant', label: 'OPPOTRON Assistant', icon: <Bot size={18}/> },
      { id: 'saved', label: 'Saved opportunities', icon: <Star size={18}/> }
    ] },
    { label: 'YOUR ORGANISATION', items: [
      { id: 'documents', label: 'Document vault', icon: <FolderOpen size={18}/> },
      { id: 'company', label: 'Organisation profile', icon: <Building2 size={18}/> },
      { id: 'settings', label: 'Settings', icon: <Settings2 size={18}/> }
    ] }
  ];
  const MatchTag = ({ tender }: { tender: Tender }) => {
    const match = matchMap.get(tender.id) || matchTender(tender, profile);
    return profileReady ? <span className={'bo-match-tag ' + (match.score >= 70 ? 'bo-match-good' : match.score >= 52 ? 'bo-match-maybe' : '')} title={match.reasons.join(' · ') || 'A relevance hint; not verified eligibility'}><Sparkles size={12}/>{match.label}</span> : null;
  };
  const renderTable = (rows: Tender[], isSaved = false) => <div className="bo-table-scroller"><table className="bo-table">
    <thead><tr><th>OPPORTUNITY</th><th>BUYER / LOCATION</th><th>CLOSING DATE</th><th>STATUS</th><th aria-label="Actions"></th></tr></thead>
    <tbody>{rows.map(t => <tr key={t.id} onClick={() => showTender(t)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') showTender(t); }}>
      <td><div className="bo-tender-name">{t.title}</div><div className="bo-subline">{t.reference || t.id} <span>·</span> {t.category || 'Uncategorised'}</div><MatchTag tender={t}/></td>
      <td><div className="bo-buyer">{t.buyer}</div><div className="bo-subline">{t.province}</div></td>
      <td><div className="bo-date">{formattedDate(t.closesAt)}</div><div className="bo-subline">{t.closesAt && daysUntil(t.closesAt) !== null && (daysUntil(t.closesAt) as number) >= 0 ? daysUntil(t.closesAt) + ' days remaining' : 'Confirm with buyer'}</div></td>
      <td><Status value={tenderStatus(t)}/></td>
      <td><div className="bo-row-actions"><button aria-label={savedIds.has(t.id) ? 'Unsave tender' : 'Save tender'} className={savedIds.has(t.id) ? 'bo-star active' : 'bo-star'} onClick={e => { e.stopPropagation(); void toggleSaved(t); }}><Star size={17} fill={savedIds.has(t.id) ? 'currentColor' : 'none'}/></button><ChevronRight size={17}/></div></td>
    </tr>)}</tbody></table>{rows.length === 0 && <Empty icon={<Search size={22}/>} title={isSaved ? 'No tenders saved yet' : 'No matching opportunities in this batch'} body={isSaved ? 'Save interesting notices from Tender intelligence to review them later.' : 'Try broader filters or load another page of government releases.'} action={<button className="bo-link" onClick={() => { setMatchOnly(false); setStateFilter('all'); setProvince(''); setSearch(''); changeView('tenders'); }}>{isSaved ? 'Explore tenders' : 'View all categories'} <ArrowRight size={15}/></button>}/>}</div>;

  return <div className={'bo-shell bo-theme-' + theme}>
    {sidebarOpen && <button className="bo-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={'bo-sidebar ' + (sidebarOpen ? 'bo-sidebar-open' : '')}>
      <div className="bo-brand"><span className="bo-brand-mark">o<span>.</span></span><span className="bo-brand-word">oppotron<span>.</span><small>OPPORTUNITY INTELLIGENCE</small></span><button className="bo-close-nav" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={20}/></button></div>
      <div className="bo-nav-section">{nav.map(group => <div key={group.label}><div className="bo-nav-label">{group.label}</div>{group.items.map(item => <button key={item.id} className={'bo-nav-item ' + (view === item.id ? 'active' : '')} onClick={() => changeView(item.id)}>{item.icon}<span>{item.label}</span>{item.id === 'saved' && saved.length > 0 && <i>{saved.length}</i>}</button>)}</div>)}</div>
      <div className="bo-sidebar-bottom"><button className="bo-signout" onClick={leave}><LogOut size={17}/> Sign out</button><div className="bo-version">OPPOTRON · BUSINESS WORKSPACE</div></div>
    </aside>
    <div className="bo-main">
      <div className="bo-topbar"><div className="bo-top-left"><button className="bo-mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={21}/></button><span className="bo-breadcrumb">Your workspace</span><ChevronRight size={14}/><strong>{nav.flatMap(g => g.items).find(n => n.id === view)?.label}</strong></div><div className="bo-top-right"><button className="bo-command-search" onClick={() => { changeView('tenders'); window.setTimeout(() => inputRef.current?.focus(), 100); }}><Search size={17}/> <span>Search opportunities</span></button><span className="bo-top-divider"/><button className="bo-theme-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button><span className="bo-avatar" title={user.email || ''}>{companyName.charAt(0).toUpperCase()}</span></div></div>
      <div className="bo-content">
        {notice && <div className="bo-toast" role="status"><CheckCircle2 size={17}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}
        {view === 'overview' && <>
          {profileError && <div className="bo-inline-error" role="alert">{profileError} <button onClick={() => window.location.reload()}>Retry connection</button></div>}
          <div className="bo-page-heading"><div><div className="bo-eyebrow"><span className="bo-live-dot"/> YOUR OPPORTUNITY DESK</div><h1>{greeting()}, {profile.contactPerson?.split(' ')[0] || 'there'}<span className="bo-heading-dot">.</span></h1><p>Your opportunities, documents and readiness — all in one place.</p></div><button className="bo-primary" onClick={() => changeView('tenders')}>Explore opportunities <ArrowUpRight size={17}/></button></div>
          <div className="bo-metrics">
            <button className="bo-metric" onClick={() => { setStateFilter('open'); setMatchOnly(true); changeView('tenders'); }}><div><span>Potential opportunities open</span><IconWrap tone="amber"><BriefcaseBusiness size={19}/></IconWrap></div><strong>{feedLoading ? '—' : profileReady ? matchedCount : relevantCount}</strong><small>{profileReady ? 'Profile-aligned notices · eligibility unverified' : 'Complete your organisation profile to enable matching'}</small><span className="bo-metric-link">Explore <ArrowUpRight size={14}/></span></button>
            <button className="bo-metric" onClick={() => changeView('saved')}><div><span>Saved opportunities</span><IconWrap tone="purple"><Star size={19}/></IconWrap></div><strong>{saved.length}</strong><small>{savedNext ? 'Next closes ' + formattedDate(savedNext.closesAt) : 'Shortlist the work that matters'}</small><span className="bo-metric-link">View list <ArrowUpRight size={14}/></span></button>
            <button className="bo-metric" onClick={() => changeView('documents')}><div><span>Secure documents</span><IconWrap tone="blue"><FolderOpen size={19}/></IconWrap></div><strong>{files.length}</strong><small>{expirySoon.length ? expirySoon.length + ' expiry dates need review' : 'Your private compliance vault'}</small><span className="bo-metric-link">Open vault <ArrowUpRight size={14}/></span></button>
            <button className="bo-metric" onClick={() => changeView('company')}><div><span>Organisation profile</span><IconWrap tone="green"><ShieldCheck size={19}/></IconWrap></div><strong>{profileLoading ? '—' : profilePct + '%'}</strong><small>{profileCompleted} of {requiredKeys.length} key fields completed</small><div className="bo-progress"><span style={{ width: profilePct + '%' }}/></div></button>
          </div>
          <div className="bo-section-grid">
            <section className="bo-panel bo-feed-preview"><div className="bo-panel-title"><div><div className="bo-small-kicker">DISCOVER</div><h3>{profileReady ? 'Matched opportunities' : 'Recent opportunities'} <span>from eTenders</span></h3><p>{profileReady ? 'Ranked using your business details; eligibility still needs checking.' : 'Complete your profile to personalise your feed.'}</p></div><button className="bo-text-action" onClick={() => changeView('tenders')}>View all <ArrowRight size={16}/></button></div>
              {feedError && <div className="bo-inline-error">{feedError} <button onClick={() => void loadTenders(1, true)}>Retry</button></div>}
              {feedLoading ? <div className="bo-skeleton-wrap">{[1,2,3].map(i => <div className="bo-skeleton" key={i}/>)}</div> : filtered.length ? <div className="bo-preview-list">{filtered.slice(0, 4).map(t => <button key={t.id} className="bo-preview-row" onClick={() => showTender(t)}><IconWrap tone="neutral"><FileText size={19}/></IconWrap><span><strong>{t.title}</strong><small>{t.buyer} · {t.province}</small><MatchTag tender={t}/></span><span className="bo-preview-right"><Status value={tenderStatus(t)}/><small>{formattedDate(t.closesAt)}</small></span><ChevronRight size={17}/></button>)}</div> : <Empty icon={<BriefcaseBusiness/>} title="No notices in this filtered batch" body="Open tender intelligence to widen your search or load more releases." action={<button className="bo-link" onClick={() => { setMatchOnly(false); setStateFilter('all'); changeView('tenders'); }}>Browse all notices <ArrowRight size={15}/></button>}/>}
            </section>
            <section className="bo-panel bo-attention"><div className="bo-panel-title"><div><div className="bo-small-kicker">YOUR NEXT STEPS</div><h3>Needs your attention</h3><p>The next steps for your organisation.</p></div><IconWrap tone="amber"><Bell size={18}/></IconWrap></div>
              <div className="bo-attention-list">
                {profilePct < 100 && <button onClick={() => changeView('company')}><span className="bo-attention-symbol"><Building2 size={18}/></span><span><strong>Complete your organisation profile</strong><small>{requiredKeys.length - profileCompleted} recommended fields remaining</small></span><ArrowUpRight size={16}/></button>}
                {files.length === 0 && <button onClick={() => changeView('documents')}><span className="bo-attention-symbol"><CloudUpload size={18}/></span><span><strong>Upload your compliance documents</strong><small>Keep documents ready for future applications</small></span><ArrowUpRight size={16}/></button>}
                {expirySoon.slice(0,2).map(f => <button key={f.id} onClick={() => changeView('documents')}><span className="bo-attention-symbol"><Clock3 size={18}/></span><span><strong>Review {f.name}</strong><small>Expiry: {formattedDate(f.expiresAt)}</small></span><ArrowUpRight size={16}/></button>)}
                {savedNext && <button onClick={() => showTender(savedNext)}><span className="bo-attention-symbol"><BriefcaseBusiness size={18}/></span><span><strong>Upcoming saved tender deadline</strong><small>{formattedDate(savedNext.closesAt)} · {savedNext.buyer}</small></span><ArrowUpRight size={16}/></button>}
                {profilePct === 100 && files.length > 0 && !expirySoon.length && !savedNext && <div className="bo-all-clear"><CheckCircle2 size={20}/><strong>Your essentials are organised.</strong><small>Explore the feed to find your next opportunity.</small></div>}
              </div>
              <div className="bo-attention-foot"><ShieldCheck size={16}/> Your information is private to your account.</div>
            </section>
          </div>
        </>}
        {(view === 'tenders' || view === 'saved') && <><div className="bo-page-heading"><div><div className="bo-eyebrow"><span className="bo-live-dot"/>{view === 'saved' ? 'YOUR SHORTLIST' : 'NATIONAL TREASURY / PUBLIC PROCUREMENT'}</div><h1>{view === 'saved' ? 'Saved opportunities' : 'Tender intelligence'}<span className="bo-heading-dot">.</span></h1><p>{view === 'saved' ? 'A focused list of the tenders you are considering.' : 'Live public procurement notices, matched to your organisation where possible.'}</p></div>{view === 'tenders' && <button className="bo-outline" onClick={() => void loadTenders(1, true)} disabled={feedLoading}><RefreshCw size={16}/> Refresh feed</button>}</div>

          <section className="bo-panel bo-tender-panel"><div className="bo-table-top"><div><div className="bo-small-kicker">{view === 'tenders' ? 'OPPORTUNITY EXPLORER' : 'YOUR SAVED WORK'}</div><h3>{view === 'tenders' ? profileReady ? 'Opportunities for your business' : 'Explore published tenders' : saved.length + ' saved opportunities'}</h3></div><span className="bo-record-count">{view === 'tenders' ? tenders.length + ' records in loaded pages' : saved.length + ' records'}</span></div>
            {view === 'saved' && savedError && <div className="bo-inline-error" role="alert">{savedError} <button onClick={() => window.location.reload()}>Retry</button></div>}
             {view === 'tenders' && profileReady && <div className="bo-match-explanation"><Sparkles size={17}/><span><strong>Ranked for {companyName}.</strong> Matches use declared services, location and CIDB details. They do not confirm tender eligibility.</span><button onClick={() => changeView('company')}>Update profile <ArrowRight size={14}/></button></div>}
             {view === 'tenders' && !profileReady && <div className="bo-match-explanation"><Building2 size={17}/><span><strong>Make your opportunities relevant.</strong> Add your mission or services, sector and operating locations to your organisation profile.</span><button onClick={() => changeView('company')}>Complete profile <ArrowRight size={14}/></button></div>}
             {view === 'tenders' && <div className="bo-filters">
               <label className="bo-search-box"><Search size={18}/><input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search opportunities, buyers, references…" aria-label="Search loaded opportunities"/></label>
               {profileReady && <label className="bo-filter-select"><Sparkles size={16}/><select aria-label="Relevance" value={matchOnly ? 'matched' : 'all'} onChange={e => setMatchOnly(e.target.value === 'matched')}><option value="matched">For you</option><option value="all">All opportunities</option></select></label>}
               <label className="bo-filter-select"><select aria-label="Province" value={province} onChange={e => setProvince(e.target.value)}><option value="">All provinces</option>{allProvinces.map(p => <option key={p}>{p}</option>)}</select></label>
               <label className="bo-filter-select"><select aria-label="Tender status" value={stateFilter} onChange={e => setStateFilter(e.target.value as 'open'|'all')}><option value="open">Open deadlines</option><option value="all">All statuses</option></select></label>
             </div>}
            {view === 'tenders' && feedError && <div className="bo-inline-error">{feedError} <button onClick={() => void loadTenders(1, true)}>Retry</button></div>}
            {view === 'tenders' && feedLoading ? <div className="bo-skeleton-wrap">{[1,2,3,4,5].map(i => <div className="bo-skeleton" key={i}/>)}</div> : renderTable(view === 'saved' ? saved : filtered, view === 'saved')}
            {view === 'tenders' && <div className="bo-table-footer"><span>Showing {filtered.length} {profileReady && matchOnly ? 'profile-aligned ' : ''}opportunities from {tenders.length} loaded notices. Matching applies to these pages only.</span><button className="bo-outline" disabled={!more || fetchingMore || feedLoading} onClick={() => void loadTenders(feedPage + 1, false)}>{fetchingMore ? 'Loading…' : more ? 'Load more releases' : 'End of loaded results'} <ArrowRight size={15}/></button></div>}
          </section>
        </>}
         {view === 'documents' && <DocumentVault user={user} files={files} loading={vaultLoading} error={vaultError} onNotice={setNotice}/>} 
         {view === 'assistant' && <AssistantHub user={user} organisation={profile} documents={files} model={model} selectedTender={assistantTender} onClearTender={() => setAssistantTender(null)} onViewProfile={() => changeView('company')}/>}
        {view === 'company' && <><div className="bo-page-heading"><div><div className="bo-eyebrow"><Building2 size={14}/> COMPANY IDENTITY</div><h1>Organisation profile<span className="bo-heading-dot">.</span></h1><p>{isNpo ? 'Describe your mission, programmes and impact so OPPOTRON can help you prepare for funding opportunities.' : 'Tell OPPOTRON what you do, where you operate and which opportunities fit.'}</p></div><span className="bo-private"><LockKeyhole size={14}/> Private company record</span></div>
          <div className="bo-company-grid"><section className="bo-panel bo-profile-card"><div className="bo-panel-title"><div><div className="bo-small-kicker">YOUR COMPANY DETAILS</div><h3>Business information</h3><p>Update your company information anytime.</p></div></div>{profileError && <div className="bo-inline-error">{profileError}</div>}<form onSubmit={saveCompany} className="bo-company-form"><div className="bo-form-row"><label>{isNpo ? 'Registered organisation name *' : 'Registered business name *'}<input required value={draft.name || ''} onChange={e => setDraft(p => ({...p, name:e.target.value}))}/></label><label>Trading name<input value={draft.tradingName || ''} onChange={e => setDraft(p => ({...p, tradingName:e.target.value}))}/></label></div><div className="bo-form-row"><label>{isNpo ? 'NPO registration number' : 'Company registration number'}<input value={draft.registration || ''} onChange={e => setDraft(p => ({...p, registration:e.target.value}))}/></label><label>Contact person<input value={draft.contactPerson || ''} onChange={e => setDraft(p => ({...p, contactPerson:e.target.value}))}/></label></div><div className="bo-form-row"><label>Contact phone<input type="tel" value={draft.phone || ''} onChange={e => setDraft(p => ({...p, phone:e.target.value}))}/></label><label>WhatsApp<input type="tel" value={draft.whatsapp || ''} onChange={e => setDraft(p => ({...p, whatsapp:e.target.value}))}/></label></div><label>{isNpo ? 'What is your organisation’s mission?' : 'What does your organisation do?'}<textarea rows={3} value={draft.description || ''} onChange={e => setDraft(p => ({...p, description:e.target.value}))}/></label><div className="bo-form-row"><label>Primary industry or service<input list="bo-industry-options" maxLength={120} value={draft.category || ''} onChange={e => setDraft(p => ({...p, category:e.target.value}))} placeholder="e.g. IT services, Civil Engineering"/><datalist id="bo-industry-options">{categories.map(c => <option key={c} value={c}/>)}</datalist></label><label>Province<select value={draft.province || ''} onChange={e => setDraft(p => ({...p, province:e.target.value}))}><option value="">Select province</option>{allProvinces.map(p => <option key={p}>{p}</option>)}</select></label></div><div className="bo-form-row"><label>City or suburb<input value={draft.city || ''} onChange={e => setDraft(p => ({...p, city:e.target.value}))}/></label><label>Years of experience<input value={draft.experience || ''} onChange={e => setDraft(p => ({...p, experience:e.target.value}))}/></label></div><label>Areas you serve<input value={draft.coverage || ''} onChange={e => setDraft(p => ({...p, coverage:e.target.value}))} placeholder="Cities and provinces"/></label><label>{isNpo ? 'Programmes and beneficiary communities' : 'Services and capabilities'}<textarea rows={3} value={draft.services || ''} onChange={e => setDraft(p => ({...p, services:e.target.value}))}/></label>{!isNpo && <label>CIDB grading or registration (if applicable)<input value={draft.cidb || ''} onChange={e => setDraft(p => ({...p, cidb:e.target.value}))}/></label>}<label>{isNpo ? 'Programmes and impact delivered' : 'Relevant project experience'}<textarea rows={3} value={draft.projects || ''} onChange={e => setDraft(p => ({...p, projects:e.target.value}))}/></label><label>{isNpo ? 'Funding goals and programmes to support' : 'Business development goals'}<textarea rows={3} value={draft.goals || ''} onChange={e => setDraft(p => ({...p, goals:e.target.value}))}/></label><div className="bo-form-footer"><span><LockKeyhole size={14}/> Your details are self-declared and not independently verified.</span><button className="bo-primary" disabled={profileSaving}>{profileSaving ? 'Saving…' : 'Save changes'} <ArrowRight size={16}/></button></div></form></section>
          <aside className="bo-profile-aside"><div className="bo-panel bo-profile-score"><div className="bo-small-kicker">ORGANISATION READINESS</div><h3>Make your profile complete.</h3><div className="bo-big-score">{profilePct}<span>%</span></div><div className="bo-progress"><span style={{width: profilePct + '%'}}/></div><p>{profileCompleted} out of {requiredKeys.length} suggested fields completed.</p><div className="bo-score-items">{requiredKeys.slice(0,6).map(key => <div key={key}><span className={profile[key] ? 'complete' : ''}>{profile[key] ? <Check size={14}/> : <span/>}</span>{key === 'name' ? 'Registered name' : key === 'registration' ? 'Registration' : key === 'category' ? 'Primary service' : key.charAt(0).toUpperCase() + key.slice(1)}</div>)}</div></div><div className="bo-profile-hint"><ShieldCheck size={19}/><strong>Private by design</strong><p>Your organisation record is only accessible to your account and authorised platform administrators.</p></div></aside></div>
        </>}
        {view === 'settings' && <><div className="bo-page-heading"><div><div className="bo-eyebrow"><Settings2 size={14}/> PERSONALISE YOUR WORKSPACE</div><h1>Settings<span className="bo-heading-dot">.</span></h1><p>Choose how OPPOTRON works for you.</p></div></div><div className="bo-settings-stack"><section className="bo-panel bo-setting-card"><div className="bo-setting-icon">{theme === 'dark' ? <Moon size={21}/> : <Sun size={21}/>}</div><div><div className="bo-small-kicker">APPEARANCE</div><h3>Workspace theme</h3><p>Choose your preferred display. This choice stays on your device.</p><div className="bo-theme-options"><button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}><Sun size={17}/> Light</button><button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}><Moon size={17}/> Dark</button></div></div></section><section className="bo-panel bo-setting-card"><div className="bo-setting-icon"><Bot size={21}/></div><div><div className="bo-small-kicker">AI ASSISTANT</div><h3>Your preferred model</h3><p>Choose your preferred OpenRouter model for opportunity decoding and your AI assistant. OPPOTRON can fall back to a free model when the selected provider is unavailable. Models have different availability and usage costs.</p><label>Model<select value={model} onChange={e => setModel(e.target.value)}>{!models.some(m=>m.id===model) && <option value={model}>{model}</option>}{models.map(m => <option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></label><button className="bo-primary" disabled={modelSaving} onClick={() => void saveModel()}>{modelSaving ? 'Saving…' : 'Save model preference'} <Check size={16}/></button></div></section><section className="bo-panel bo-setting-card"><div className="bo-setting-icon"><LockKeyhole size={21}/></div><div><div className="bo-small-kicker">ACCOUNT & PRIVACY</div><h3>Account</h3><p>Signed in as <strong>{user.email}</strong>. Your organisation profile, chat history and document metadata are private to your account.</p><button className="bo-outline" onClick={leave}><LogOut size={16}/> Sign out of OPPOTRON</button></div></section></div></>}
        <div className="bo-footer"><span>OPPOTRON · YOUR ORGANISATION. THE RIGHT OPPORTUNITIES.</span><span>South Africa · © {new Date().getFullYear()}</span></div>
      </div>
    </div>
    {selected && <div className="bo-dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}><section className="bo-dialog" role="dialog" aria-modal="true" aria-label="Tender details"><div className="bo-dialog-top"><div><span className="bo-small-kicker">TENDER INTELLIGENCE / NOTICE DETAILS</span><div className="bo-dialog-meta">{selected.reference || selected.id} <span>·</span> <Status value={tenderStatus(selected)}/></div></div><button className="bo-icon-button" onClick={() => setSelected(null)} aria-label="Close tender"><X size={20}/></button></div><div className="bo-dialog-body"><h2>{selected.title}</h2>{profileReady && <div className="bo-dialog-match"><MatchTag tender={selected}/><span>{(matchMap.get(selected.id) || matchTender(selected, profile)).reasons.join(' · ') || 'Limited data is available for matching.'}</span>{(matchMap.get(selected.id) || matchTender(selected, profile)).warning && <small>{(matchMap.get(selected.id) || matchTender(selected, profile)).warning}</small>}</div>}<p className="bo-dialog-desc">{selected.description || 'No public description provided.'}</p><div className="bo-detail-grid"><div><span>ISSUING ORGANISATION</span><strong>{selected.buyer}</strong></div><div><span>PROVINCE / LOCATION</span><strong>{selected.province}</strong></div><div><span>CLOSING DATE</span><strong>{formattedDate(selected.closesAt)}</strong></div><div><span>PUBLICATION DATE</span><strong>{formattedDate(selected.publishedAt)}</strong></div></div>{selected.eligibility && <div className="bo-detail-section"><h3>Published eligibility criteria</h3><p>{selected.eligibility}</p></div>}{selected.specialConditions && <div className="bo-detail-section"><h3>Special conditions</h3><p>{selected.specialConditions}</p></div>}{selected.briefing && <div className="bo-detail-section"><h3>Briefing session {selected.briefing.compulsory ? '· Listed as compulsory' : ''}</h3><p>{selected.briefing.date || 'Date not specified'} · {selected.briefing.venue || 'Venue not specified'}</p></div>}{selected.submission && <div className="bo-detail-section"><h3>Submission information</h3><p>{selected.submission}</p></div>}
    {selected.documents.length > 0 && <div className="bo-detail-section"><h3>Published tender documents</h3><div className="bo-doc-links">{selected.documents.map((d,i) => <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"><FileText size={15}/>{d.title}<ExternalLink size={14}/></a>)}</div></div>}
    <div className="bo-ai-explainer"><div className="bo-ai-header"><IconWrap tone="purple"><Sparkles size={20}/></IconWrap><div><strong>Make this tender understandable</strong><p>OPPOTRON explains what the buyer needs, the requirements published and what to check next.</p></div></div>{analysis ? <div className="bo-ai-answer">{analysis}</div> : <button className="bo-primary" disabled={analysing} onClick={() => void explain(selected)}><Sparkles size={16}/>{analysing ? 'Analysing notice…' : 'Explain with AI'} <ArrowRight size={16}/></button>}{aiError && <div className="bo-inline-error">{aiError}</div>}<small>AI-assisted information, not a qualification decision. Verify original procurement documents.</small></div>
    <p className="bo-source-disclaimer">Source: National Treasury eTenders OCDS public releases. Publication coverage is not complete; dates and documents may change.</p></div><div className="bo-dialog-actions"><button className="bo-outline" onClick={() => openAssistantFor(selected)}><Bot size={16}/> Ask OPPOTRON</button><button className="bo-outline" onClick={() => void toggleSaved(selected)}><Star size={16} fill={savedIds.has(selected.id) ? 'currentColor' : 'none'}/>{savedIds.has(selected.id) ? 'Remove saved' : 'Save opportunity'}</button><a className="bo-primary" href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Original portal <ExternalLink size={16}/></a></div></section></div>}
    {view !== 'assistant' && <button className="op-chat-fab" onClick={() => changeView('assistant')} aria-label="Chat with OPPOTRON"><span className="op-chat-fab-icon"><Bot size={21}/></span><span>Ask OPPOTRON</span></button>}
    {!profileLoading && !profileError && !profile.organizationType && <OrganisationOnboarding onChoose={chooseOrganisation}/>}
  </div>;
}