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
import './workspace.css';

type View = 'overview' | 'tenders' | 'saved' | 'documents' | 'company' | 'settings';
type Tender = {
  id: string; reference: string; title: string; description: string; buyer: string; province: string;
  category: string; status: string; publishedAt: string; closesAt: string;
  eligibility: string; specialConditions: string; submission: string;
  briefing: { date: string; venue: string; compulsory: boolean } | null;
  documents: { title: string; url: string }[]; value: number | null; currency: string;
  source: string; sourceUrl: string;
};
type Company = Record<string, string>;
type VaultFile = { id: string; key: string; name: string; type: string; size: number; category: string; expiresAt: string; createdAt?: { seconds: number } };
type Model = { id: string; name: string; promptPrice?: number; completionPrice?: number };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Theme = 'light' | 'dark';
const allProvinces = ['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West'];
const categories = ['General Building', 'Civil Engineering', 'Electrical', 'Plumbing', 'Roofing', 'Painting', 'Renovations', 'Roads', 'Paving', 'Landscaping', 'Construction Supply', 'Mechanical Works', 'Specialist Construction Services'];
const docCategories = ['Compliance', 'Registration', 'Tax & finance', 'Qualifications', 'Project records', 'Other'];
const profileKeys = ['name', 'registration', 'phone', 'description', 'category', 'province', 'city', 'coverage', 'services', 'experience', 'projects', 'cidb'];
const safeDate = (date: string | undefined) => { const d = new Date(date || ''); return !Number.isNaN(d.getTime()) ? d : null; };
const formattedDate = (date: string | undefined) => safeDate(date)?.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) || 'Not specified';
const formatSize = (n: number) => n < 1024 * 1024 ? (n / 1024).toFixed(0) + ' KB' : (n / (1024 * 1024)).toFixed(1) + ' MB';
const isConstruction = (t: Tender) => {
  const cat = t.category.toLowerCase();
  if (cat === 'works' || cat.includes('construction') || cat.includes('building')) return true;
  return /construction|renovation|roofing|plumbing|building works|civil works|road works|paving|maintenance of (buildings|roads)|electrical installation|refurbish|cidb|infrastructure|contractor/.test((t.title + ' ' + t.description.slice(0, 500)).toLowerCase());
};
const tenderStatus = (t: Tender) => {
  const status = t.status.toLowerCase();
  if (/cancel|withdraw/.test(status)) return 'Cancelled';
  if (/complete|closed|unsuccessful/.test(status)) return 'Closed';
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
  const [view, setView] = useState<View>(['overview', 'tenders', 'saved', 'documents', 'company', 'settings'].includes(fromPath) ? fromPath as View : 'overview');
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
    try { const saved = localStorage.getItem('builda-theme'); if (saved === 'dark' || saved === 'light') return saved; }
    catch { /* storage unavailable */ }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const installEvent = useRef<InstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
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
  const [typeFilter, setTypeFilter] = useState<'construction' | 'all'>('construction');
  const [stateFilter, setStateFilter] = useState<'open' | 'all'>('open');
  const [matchOnly, setMatchOnly] = useState(false);
  const [selected, setSelected] = useState<Tender | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [model, setModel] = useState('openai/gpt-4o-mini');
  const [models, setModels] = useState<Model[]>([{ id: 'openai/gpt-4o-mini', name: 'GPT-4o mini' }]);
  const [modelSaving, setModelSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileCategory, setFileCategory] = useState('Compliance');
  const [fileExpiry, setFileExpiry] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { localStorage.setItem('builda-theme', theme); } catch { /* privacy settings */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101b20' : '#f6f8f7');
  }, [theme]);
  useEffect(() => {
    const beforeInstall = (event: Event) => { event.preventDefault(); installEvent.current = event as InstallPromptEvent; setCanInstall(true); };
    const didInstall = () => { setInstalled(true); setCanInstall(false); installEvent.current = null; };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', didInstall);
    return () => { window.removeEventListener('beforeinstallprompt', beforeInstall); window.removeEventListener('appinstalled', didInstall); };
  }, []);
  const installApp = async () => {
    const prompt = installEvent.current;
    if (!prompt) {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      setNotice(ios ? 'On Safari, tap Share, then Add to Home Screen.' : 'Open your browser menu and choose Install app or Add to Home Screen.');
      return;
    }
    installEvent.current = null; setCanInstall(false);
    try { await prompt.prompt(); const decision = await prompt.userChoice; if (decision.outcome === 'accepted') setInstalled(true); }
    catch { setNotice('Use your browser menu to install BUILDA.'); }
  };
  const changeView = (next: View) => {
    setView(next); setSidebarOpen(false); setNotice('');
    window.history.replaceState(null, '', next === 'overview' ? '/app' : '/app/' + next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  useEffect(() => {
    if (!db) { setProfileError('Firebase is not configured. Check the project settings.'); setProfileLoading(false); return; }
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
    try {
      if (replace) { setFeedLoading(true); setFeedError(''); } else setFetchingMore(true);
      const response = await api<{ items: Tender[]; hasMore: boolean; updatedAt: string }>(user, '/api/tenders?page=' + page);
      setTenders(old => replace ? response.items : [...new Map([...old, ...response.items].map(t => [t.id, t])).values()]);
      setMore(response.hasMore); setFeedPage(page); setFeedUpdated(response.updatedAt);
    } catch (error) { setFeedError(error instanceof Error ? error.message : 'Unable to retrieve government tenders.'); }
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
  const matchedCount = rankedTenders.filter(entry => tenderStatus(entry.tender) === 'Open' && isConstruction(entry.tender) && entry.match.score >= 52).length;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenders.filter(t => {
      if (typeFilter === 'construction' && !isConstruction(t)) return false;
      if (stateFilter === 'open' && tenderStatus(t) !== 'Open') return false;
      if (province && !t.province.toLowerCase().includes(province.toLowerCase())) return false;
      if (matchOnly && profileReady && (matchMap.get(t.id)?.score ?? 0) < 52) return false;
      return !q || [t.title, t.reference, t.buyer, t.province, t.description].some(s => s?.toLowerCase().includes(q));
    }).sort((a, b) => {
      if (profileReady) { const difference = (matchMap.get(b.id)?.score ?? 0) - (matchMap.get(a.id)?.score ?? 0); if (difference) return difference; }
      return (safeDate(a.closesAt)?.getTime() || Number.MAX_SAFE_INTEGER) - (safeDate(b.closesAt)?.getTime() || Number.MAX_SAFE_INTEGER);
    });
  }, [tenders, typeFilter, stateFilter, search, province, matchOnly, profileReady, profile, matchMap]);
  const relevantCount = tenders.filter(t => isConstruction(t) && tenderStatus(t) === 'Open').length;
  const profileCompleted = profileKeys.filter(k => profile[k]?.trim()).length;
  const profilePct = Math.round(profileCompleted / profileKeys.length * 100);
  const companyName = profile.tradingName || profile.name || 'Your company';
  const savedNext = saved.filter(t => tenderStatus(t) === 'Open').sort((a,b) => (safeDate(a.closesAt)?.getTime() || Infinity) - (safeDate(b.closesAt)?.getTime() || Infinity))[0];
  const expirySoon = files.filter(f => f.expiresAt && daysUntil(f.expiresAt) !== null && (daysUntil(f.expiresAt) as number) <= 30);
  const showTender = (t: Tender) => { setSelected(t); setAnalysis(''); setAiError(''); };

  const saveCompany = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!db || !draft.name?.trim()) { setProfileError('A registered company name is required.'); return; }
    setProfileSaving(true); setProfileError('');
    try {
      const record = Object.fromEntries(Object.entries(draft).filter(([key]) => [...profileKeys, 'tradingName', 'contactPerson', 'whatsapp', 'goals'].includes(key)).map(([key, val]) => [key, String(val || '').slice(0, 4000)]));
      await setDoc(doc(db, 'contractors', user.uid), { ...record, ownerId: user.uid, email: user.email || '', updatedAt: serverTimestamp() }, { merge: true });
      setProfile(record); setNotice('Company profile saved securely.');
    } catch { setProfileError('Unable to save. Check your Firestore permissions and try again.'); }
    finally { setProfileSaving(false); }
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
  const upload = async (file: File | undefined) => {
    if (!file || !db || vaultError || vaultLoading) return;
    let uploadedKey: string | null = null;
    setUploading(true); setNotice('');
    try {
      const typeByExtension: Record<string, string> = {
        pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const type = typeByExtension[ext];
      if (!type || file.size > 15 * 1024 * 1024 || !file.size) throw new Error('Choose a PDF, image, Word or Excel file up to 15 MB.');
      const signed = await api<{ url: string; id: string; key: string; name: string; type: string; size: number }>(user, '/api/documents', {
        method: 'POST', body: JSON.stringify({ name: file.name, type, size: file.size }) });
      const response = await fetch(signed.url, { method: 'PUT', headers: { 'Content-Type': signed.type }, body: file });
      if (!response.ok) throw new Error('Upload failed. Check document storage settings and try again.');
      uploadedKey = signed.key;
      await setDoc(doc(db, 'contractors', user.uid, 'documents', signed.id), {
        ownerId: user.uid, key: signed.key, name: signed.name, type: signed.type, size: file.size,
        category: fileCategory, expiresAt: fileExpiry, createdAt: serverTimestamp()
      });
      setNotice(file.name + ' uploaded to your private document vault.');
      if (uploadRef.current) uploadRef.current.value = '';
    } catch (err) {
      if (uploadedKey) {
        try { await api(user, '/api/documents?key=' + encodeURIComponent(uploadedKey), { method: 'DELETE' }); }
        catch { /* server cleanup may require administrator review */ }
      }
      setNotice(err instanceof Error ? err.message : 'Upload unsuccessful.');
    }
    finally { setUploading(false); }
  };
  const openFile = async (f: VaultFile) => {
    // Open within the original click event; browsers often block a popup opened after an await.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const result = await api<{ url: string }>(user, '/api/documents?key=' + encodeURIComponent(f.key));
      if (tab && !tab.closed) tab.location.replace(result.url);
      else window.location.assign(result.url);
    } catch {
      if (tab && !tab.closed) tab.close();
      setNotice('Unable to open the file. Check document storage configuration.');
    }
  };
  const removeFile = async (f: VaultFile) => {
    if (!window.confirm('Permanently delete ' + f.name + '?') || !db) return;
    try { await api(user, '/api/documents?key=' + encodeURIComponent(f.key), { method: 'DELETE' }); await deleteDoc(doc(db, 'contractors', user.uid, 'documents', f.id)); setNotice('Document deleted.'); }
    catch { setNotice('Unable to delete document. Please retry.'); }
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
      { id: 'tenders', label: 'Tender intelligence', icon: <BriefcaseBusiness size={18}/> },
      { id: 'saved', label: 'Saved opportunities', icon: <Star size={18}/> }
    ] },
    { label: 'YOUR BUSINESS', items: [
      { id: 'documents', label: 'Document vault', icon: <FolderOpen size={18}/> },
      { id: 'company', label: 'Company profile', icon: <Building2 size={18}/> },
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
    </tr>)}</tbody></table>{rows.length === 0 && <Empty icon={<Search size={22}/>} title={isSaved ? 'No tenders saved yet' : 'No matching opportunities in this batch'} body={isSaved ? 'Save interesting notices from Tender intelligence to review them later.' : 'Try broader filters or load another page of government releases.'} action={<button className="bo-link" onClick={() => { setTypeFilter('all'); setStateFilter('all'); setProvince(''); setSearch(''); changeView('tenders'); }}>{isSaved ? 'Explore tenders' : 'View all categories'} <ArrowRight size={15}/></button>}/>}</div>;

  return <div className={'bo-shell bo-theme-' + theme}>
    {sidebarOpen && <button className="bo-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={'bo-sidebar ' + (sidebarOpen ? 'bo-sidebar-open' : '')}>
      <div className="bo-brand"><span className="bo-brand-mark">b<span>.</span></span><span className="bo-brand-word">builda<span>.</span><small>CONTRACTOR OS</small></span><button className="bo-close-nav" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={20}/></button></div>
      <div className="bo-nav-section">{nav.map(group => <div key={group.label}><div className="bo-nav-label">{group.label}</div>{group.items.map(item => <button key={item.id} className={'bo-nav-item ' + (view === item.id ? 'active' : '')} onClick={() => changeView(item.id)}>{item.icon}<span>{item.label}</span>{item.id === 'saved' && saved.length > 0 && <i>{saved.length}</i>}</button>)}</div>)}</div>
      <div className="bo-sidebar-bottom">{!installed && <div className="bo-install-tile"><span className="bo-install-icon"><Download size={18}/></span><strong>BUILDA, always within reach.</strong><p>Access your workspace straight from your home screen.</p><button onClick={() => void installApp()}><Download size={15}/>{canInstall ? 'Install BUILDA app' : 'Download app'}</button></div>}<button className="bo-signout" onClick={leave}><LogOut size={17}/> Sign out</button><div className="bo-version">BUILDA · CONTRACTOR WORKSPACE</div></div>
    </aside>
    <div className="bo-main">
      <div className="bo-topbar"><div className="bo-top-left"><button className="bo-mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={21}/></button><span className="bo-breadcrumb">Your workspace</span><ChevronRight size={14}/><strong>{nav.flatMap(g => g.items).find(n => n.id === view)?.label}</strong></div><div className="bo-top-right"><button className="bo-command-search" onClick={() => { changeView('tenders'); window.setTimeout(() => inputRef.current?.focus(), 100); }}><Search size={17}/> <span>Search opportunities</span></button><span className="bo-top-divider"/><button className="bo-theme-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button><span className="bo-avatar" title={user.email || ''}>{companyName.charAt(0).toUpperCase()}</span></div></div>
      <div className="bo-content">
        {notice && <div className="bo-toast" role="status"><CheckCircle2 size={17}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}
        {view === 'overview' && <>
          {profileError && <div className="bo-inline-error" role="alert">{profileError} <button onClick={() => window.location.reload()}>Retry connection</button></div>}
          <div className="bo-page-heading"><div><div className="bo-eyebrow"><span className="bo-live-dot"/> YOUR BUSINESS AT A GLANCE</div><h1>{greeting()}, {profile.contactPerson?.split(' ')[0] || 'builder'}<span className="bo-heading-dot">.</span></h1><p>Here’s what’s happening across your business workspace.</p></div><button className="bo-primary" onClick={() => changeView('tenders')}>Explore tenders <ArrowUpRight size={17}/></button></div>
          <div className="bo-hero"><div className="bo-hero-copy"><div className="bo-hero-kicker"><Sparkles size={16}/> MEET YOUR INTELLIGENT WORKSPACE</div><h2>Better opportunities.<br/><em>Built around your business.</em></h2><p>BUILDA uses your capabilities and service areas to bring promising notices forward, and explains what to verify before bidding.</p><button onClick={() => changeView('tenders')}>Open tender intelligence <ArrowRight size={16}/></button></div><div className="bo-hero-visual" aria-hidden="true"><div className="bo-ring bo-ring-one"/><div className="bo-ring bo-ring-two"/><div className="bo-visual-core"><Sparkles size={42}/></div><span>BUILDA / INTELLIGENCE</span></div></div>
          <div className="bo-metrics">
            <button className="bo-metric" onClick={() => { setStateFilter('open'); setTypeFilter('construction'); changeView('tenders'); }}><div><span>Potential construction notices</span><IconWrap tone="amber"><BriefcaseBusiness size={19}/></IconWrap></div><strong>{feedLoading ? '—' : profileReady ? matchedCount : relevantCount}</strong><small>{profileReady ? 'Profile-aligned notices · eligibility unverified' : 'Complete your company profile to enable matching'}</small><span className="bo-metric-link">Explore <ArrowUpRight size={14}/></span></button>
            <button className="bo-metric" onClick={() => changeView('saved')}><div><span>Saved opportunities</span><IconWrap tone="purple"><Star size={19}/></IconWrap></div><strong>{saved.length}</strong><small>{savedNext ? 'Next closes ' + formattedDate(savedNext.closesAt) : 'Shortlist the work that matters'}</small><span className="bo-metric-link">View list <ArrowUpRight size={14}/></span></button>
            <button className="bo-metric" onClick={() => changeView('documents')}><div><span>Secure documents</span><IconWrap tone="blue"><FolderOpen size={19}/></IconWrap></div><strong>{files.length}</strong><small>{expirySoon.length ? expirySoon.length + ' expiry dates need review' : 'Your private compliance vault'}</small><span className="bo-metric-link">Open vault <ArrowUpRight size={14}/></span></button>
            <button className="bo-metric" onClick={() => changeView('company')}><div><span>Company profile</span><IconWrap tone="green"><ShieldCheck size={19}/></IconWrap></div><strong>{profileLoading ? '—' : profilePct + '%'}</strong><small>{profileCompleted} of {profileKeys.length} key fields completed</small><div className="bo-progress"><span style={{ width: profilePct + '%' }}/></div></button>
          </div>
          <div className="bo-section-grid">
            <section className="bo-panel bo-feed-preview"><div className="bo-panel-title"><div><div className="bo-small-kicker">DISCOVER</div><h3>{profileReady ? 'Matched opportunities' : 'Recent opportunities'} <span>from eTenders</span></h3><p>{profileReady ? 'Ranked using your business details; eligibility still needs checking.' : 'Complete your profile to personalise your feed.'}</p></div><button className="bo-text-action" onClick={() => changeView('tenders')}>View all <ArrowRight size={16}/></button></div>
              {feedError && <div className="bo-inline-error">{feedError} <button onClick={() => void loadTenders(1, true)}>Retry</button></div>}
              {feedLoading ? <div className="bo-skeleton-wrap">{[1,2,3].map(i => <div className="bo-skeleton" key={i}/>)}</div> : filtered.length ? <div className="bo-preview-list">{filtered.slice(0, 4).map(t => <button key={t.id} className="bo-preview-row" onClick={() => showTender(t)}><IconWrap tone="neutral"><FileText size={19}/></IconWrap><span><strong>{t.title}</strong><small>{t.buyer} · {t.province}</small><MatchTag tender={t}/></span><span className="bo-preview-right"><Status value={tenderStatus(t)}/><small>{formattedDate(t.closesAt)}</small></span><ChevronRight size={17}/></button>)}</div> : <Empty icon={<BriefcaseBusiness/>} title="No notices in this filtered batch" body="Open tender intelligence to widen your search or load more releases." action={<button className="bo-link" onClick={() => { setTypeFilter('all'); setStateFilter('all'); changeView('tenders'); }}>Browse all notices <ArrowRight size={15}/></button>}/>}
            </section>
            <section className="bo-panel bo-attention"><div className="bo-panel-title"><div><div className="bo-small-kicker">YOUR NEXT STEPS</div><h3>Needs your attention</h3><p>Simple actions to keep your business ready.</p></div><IconWrap tone="amber"><Bell size={18}/></IconWrap></div>
              <div className="bo-attention-list">
                {profilePct < 100 && <button onClick={() => changeView('company')}><span className="bo-attention-symbol"><Building2 size={18}/></span><span><strong>Complete your company profile</strong><small>{profileKeys.length - profileCompleted} recommended fields remaining</small></span><ArrowUpRight size={16}/></button>}
                {files.length === 0 && <button onClick={() => changeView('documents')}><span className="bo-attention-symbol"><CloudUpload size={18}/></span><span><strong>Upload your compliance documents</strong><small>Keep them secure and easy to access</small></span><ArrowUpRight size={16}/></button>}
                {expirySoon.slice(0,2).map(f => <button key={f.id} onClick={() => changeView('documents')}><span className="bo-attention-symbol"><Clock3 size={18}/></span><span><strong>Review {f.name}</strong><small>Expiry: {formattedDate(f.expiresAt)}</small></span><ArrowUpRight size={16}/></button>)}
                {savedNext && <button onClick={() => showTender(savedNext)}><span className="bo-attention-symbol"><BriefcaseBusiness size={18}/></span><span><strong>Upcoming saved tender deadline</strong><small>{formattedDate(savedNext.closesAt)} · {savedNext.buyer}</small></span><ArrowUpRight size={16}/></button>}
                {profilePct === 100 && files.length > 0 && !expirySoon.length && !savedNext && <div className="bo-all-clear"><CheckCircle2 size={20}/><strong>Your essentials are organised.</strong><small>Explore the feed to find your next opportunity.</small></div>}
              </div>
              <div className="bo-attention-foot"><ShieldCheck size={16}/> Your information is private to your account.</div>
            </section>
          </div>
        </>}
        {(view === 'tenders' || view === 'saved') && <><div className="bo-page-heading"><div><div className="bo-eyebrow"><span className="bo-live-dot"/>{view === 'saved' ? 'YOUR SHORTLIST' : 'NATIONAL TREASURY / PUBLIC PROCUREMENT'}</div><h1>{view === 'saved' ? 'Saved opportunities' : 'Tender intelligence'}<span className="bo-heading-dot">.</span></h1><p>{view === 'saved' ? 'A focused list of the tenders you are considering.' : 'A clearer way to explore government construction opportunities.'}</p></div>{view === 'tenders' && <button className="bo-outline" onClick={() => void loadTenders(1, true)} disabled={feedLoading}><RefreshCw size={16}/> Refresh feed</button>}</div>

          <section className="bo-panel bo-tender-panel"><div className="bo-table-top"><div><div className="bo-small-kicker">{view === 'tenders' ? 'OPPORTUNITY EXPLORER' : 'YOUR SAVED WORK'}</div><h3>{view === 'tenders' ? profileReady ? 'Opportunities for your business' : 'Explore published tenders' : saved.length + ' saved opportunities'}</h3></div><span className="bo-record-count">{view === 'tenders' ? tenders.length + ' records in loaded pages' : saved.length + ' records'}</span></div>
            {view === 'saved' && savedError && <div className="bo-inline-error" role="alert">{savedError} <button onClick={() => window.location.reload()}>Retry</button></div>}
             {view === 'tenders' && profileReady && <div className="bo-match-explanation"><Sparkles size={17}/><span><strong>Ranked for {companyName}.</strong> Matches use declared services, location and CIDB details. They do not confirm tender eligibility.</span><button onClick={() => changeView('company')}>Update profile <ArrowRight size={14}/></button></div>}
             {view === 'tenders' && !profileReady && <div className="bo-match-explanation"><Building2 size={17}/><span><strong>Make opportunities relevant.</strong> Add your services and locations to your company profile.</span><button onClick={() => changeView('company')}>Complete profile <ArrowRight size={14}/></button></div>}
             {view === 'tenders' && <div className="bo-filters"><label className="bo-search-box"><Search size={18}/><input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notices, buyers, references…" aria-label="Search loaded tenders"/></label><label className="bo-filter-select">{profileReady && <select aria-label="Opportunity relevance" value={matchOnly ? 'matched' : 'all'} onChange={e => setMatchOnly(e.target.value === 'matched')}><option value="all">Ranked for you</option><option value="matched">Best matches</option></select>}</label><label className="bo-filter-select"><Filter size={16}/><select aria-label="Category" value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'construction' | 'all')}><option value="construction">Construction-focused</option><option value="all">All categories</option></select></label><label className="bo-filter-select"><select aria-label="Province" value={province} onChange={e => setProvince(e.target.value)}><option value="">All provinces</option>{allProvinces.map(p => <option key={p}>{p}</option>)}</select></label><label className="bo-filter-select"><select aria-label="Tender status" value={stateFilter} onChange={e => setStateFilter(e.target.value as 'open'|'all')}><option value="open">Open deadlines</option><option value="all">All statuses</option></select></label></div>}
            {view === 'tenders' && feedError && <div className="bo-inline-error">{feedError} <button onClick={() => void loadTenders(1, true)}>Retry</button></div>}
            {view === 'tenders' && feedLoading ? <div className="bo-skeleton-wrap">{[1,2,3,4,5].map(i => <div className="bo-skeleton" key={i}/>)}</div> : renderTable(view === 'saved' ? saved : filtered, view === 'saved')}
            {view === 'tenders' && <div className="bo-table-footer"><span>Showing {filtered.length} matching records from {tenders.length} loaded releases. Search applies to loaded pages only.</span><button className="bo-outline" disabled={!more || fetchingMore || feedLoading} onClick={() => void loadTenders(feedPage + 1, false)}>{fetchingMore ? 'Loading…' : more ? 'Load more releases' : 'End of loaded results'} <ArrowRight size={15}/></button></div>}
          </section>
        </>}
        {view === 'documents' && <><div className="bo-page-heading"><div><div className="bo-eyebrow"><LockKeyhole size={13}/> PRIVATE BUSINESS STORAGE</div><h1>Document vault<span className="bo-heading-dot">.</span></h1><p>One secure place for your important company and compliance files.</p></div><button className="bo-primary" onClick={() => uploadRef.current?.click()} disabled={uploading || vaultLoading || Boolean(vaultError)}><CloudUpload size={17}/>{uploading ? 'Uploading…' : vaultLoading ? 'Connecting…' : 'Upload a document'}</button></div>
          {vaultError && <div className="bo-inline-error" role="alert">{vaultError} <button onClick={() => window.location.reload()}>Retry</button></div>}<section className="bo-panel bo-upload-panel"><div><IconWrap tone="blue"><CloudUpload size={24}/></IconWrap><h3>Your documents, intelligently organised.</h3><p>Keep your CSD, CIDB, tax and project documentation in one private space. Maximum 15 MB per file.</p></div><div className="bo-upload-inputs"><label>Document category<select value={fileCategory} onChange={e => setFileCategory(e.target.value)}>{docCategories.map(c => <option key={c}>{c}</option>)}</select></label><label>Expiry date (optional)<input type="date" value={fileExpiry} onChange={e => setFileExpiry(e.target.value)}/></label><input ref={uploadRef} type="file" className="bo-hidden-input" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx" onChange={e => void upload(e.target.files?.[0])}/><button className="bo-outline" disabled={uploading || vaultLoading || Boolean(vaultError)} onClick={() => uploadRef.current?.click()}><CloudUpload size={17}/> Select a file</button></div></section>
          {!vaultError && <section className="bo-panel bo-files-panel"><div className="bo-table-top"><div><div className="bo-small-kicker">ENCRYPTED CLOUD STORAGE</div><h3>Company documents</h3></div><span className="bo-record-count">{files.length} files</span></div>{files.length ? <div className="bo-file-list">{files.map(f => <div className="bo-file" key={f.id}><IconWrap tone="blue"><FileText size={21}/></IconWrap><div><strong>{f.name}</strong><small>{f.category} · {formatSize(f.size)}{f.expiresAt ? ' · Expires ' + formattedDate(f.expiresAt) : ''}</small></div><button title="Open document" aria-label={'Open ' + f.name} onClick={() => void openFile(f)}><ArrowDownToLine size={18}/></button><button title="Delete document" aria-label={'Delete ' + f.name} onClick={() => void removeFile(f)}><Trash2 size={17}/></button></div>)}</div> : <Empty icon={<FolderOpen size={25}/>} title="A fresh start for your document vault" body="Upload your first document to keep it safe and ready whenever you need it." action={<button className="bo-link" onClick={() => uploadRef.current?.click()}>Upload a document <ArrowRight size={15}/></button>}/>}</section>}
        </>}
        {view === 'company' && <><div className="bo-page-heading"><div><div className="bo-eyebrow"><Building2 size={14}/> COMPANY IDENTITY</div><h1>Company profile<span className="bo-heading-dot">.</span></h1><p>Help BUILDA understand your services, experience and where you work.</p></div><span className="bo-private"><LockKeyhole size={14}/> Private company record</span></div>
          <div className="bo-company-grid"><section className="bo-panel bo-profile-card"><div className="bo-panel-title"><div><div className="bo-small-kicker">YOUR COMPANY DETAILS</div><h3>Business information</h3><p>Update your company information anytime.</p></div></div>{profileError && <div className="bo-inline-error">{profileError}</div>}<form onSubmit={saveCompany} className="bo-company-form"><div className="bo-form-row"><label>Registered business name *<input required value={draft.name || ''} onChange={e => setDraft(p => ({...p, name:e.target.value}))}/></label><label>Trading name<input value={draft.tradingName || ''} onChange={e => setDraft(p => ({...p, tradingName:e.target.value}))}/></label></div><div className="bo-form-row"><label>Company registration number<input value={draft.registration || ''} onChange={e => setDraft(p => ({...p, registration:e.target.value}))}/></label><label>Contact person<input value={draft.contactPerson || ''} onChange={e => setDraft(p => ({...p, contactPerson:e.target.value}))}/></label></div><div className="bo-form-row"><label>Contact phone<input type="tel" value={draft.phone || ''} onChange={e => setDraft(p => ({...p, phone:e.target.value}))}/></label><label>WhatsApp<input type="tel" value={draft.whatsapp || ''} onChange={e => setDraft(p => ({...p, whatsapp:e.target.value}))}/></label></div><label>What does your company do?<textarea rows={3} value={draft.description || ''} onChange={e => setDraft(p => ({...p, description:e.target.value}))}/></label><div className="bo-form-row"><label>Primary service<select value={draft.category || ''} onChange={e => setDraft(p => ({...p, category:e.target.value}))}><option value="">Choose a service</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Province<select value={draft.province || ''} onChange={e => setDraft(p => ({...p, province:e.target.value}))}><option value="">Select province</option>{allProvinces.map(p => <option key={p}>{p}</option>)}</select></label></div><div className="bo-form-row"><label>City or suburb<input value={draft.city || ''} onChange={e => setDraft(p => ({...p, city:e.target.value}))}/></label><label>Years of experience<input value={draft.experience || ''} onChange={e => setDraft(p => ({...p, experience:e.target.value}))}/></label></div><label>Areas you serve<input value={draft.coverage || ''} onChange={e => setDraft(p => ({...p, coverage:e.target.value}))} placeholder="Cities and provinces"/></label><label>Services and capabilities<textarea rows={3} value={draft.services || ''} onChange={e => setDraft(p => ({...p, services:e.target.value}))}/></label><label>CIDB grading or registration (if applicable)<input value={draft.cidb || ''} onChange={e => setDraft(p => ({...p, cidb:e.target.value}))}/></label><label>Relevant project experience<textarea rows={3} value={draft.projects || ''} onChange={e => setDraft(p => ({...p, projects:e.target.value}))}/></label><label>Business development goals<textarea rows={3} value={draft.goals || ''} onChange={e => setDraft(p => ({...p, goals:e.target.value}))}/></label><div className="bo-form-footer"><span><LockKeyhole size={14}/> Your details are self-declared and not independently verified.</span><button className="bo-primary" disabled={profileSaving}>{profileSaving ? 'Saving…' : 'Save changes'} <ArrowRight size={16}/></button></div></form></section>
          <aside className="bo-profile-aside"><div className="bo-panel bo-profile-score"><div className="bo-small-kicker">BUSINESS READINESS</div><h3>Make your profile complete.</h3><div className="bo-big-score">{profilePct}<span>%</span></div><div className="bo-progress"><span style={{width: profilePct + '%'}}/></div><p>{profileCompleted} out of {profileKeys.length} suggested fields completed.</p><div className="bo-score-items">{profileKeys.slice(0,6).map(key => <div key={key}><span className={profile[key] ? 'complete' : ''}>{profile[key] ? <Check size={14}/> : <span/>}</span>{key === 'name' ? 'Registered name' : key === 'registration' ? 'Registration' : key === 'category' ? 'Primary service' : key.charAt(0).toUpperCase() + key.slice(1)}</div>)}</div></div><div className="bo-profile-hint"><ShieldCheck size={19}/><strong>Private by design</strong><p>Your company record is only accessible to your account and authorised platform administrators.</p></div></aside></div>
        </>}
        {view === 'settings' && <><div className="bo-page-heading"><div><div className="bo-eyebrow"><Settings2 size={14}/> PERSONALISE YOUR WORKSPACE</div><h1>Settings<span className="bo-heading-dot">.</span></h1><p>Choose how BUILDA works for you.</p></div></div><div className="bo-settings-stack"><section className="bo-panel bo-setting-card"><div className="bo-setting-icon">{theme === 'dark' ? <Moon size={21}/> : <Sun size={21}/>}</div><div><div className="bo-small-kicker">APPEARANCE</div><h3>Workspace theme</h3><p>Choose your preferred display. This choice stays on your device.</p><div className="bo-theme-options"><button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}><Sun size={17}/> Light</button><button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}><Moon size={17}/> Dark</button></div></div></section><section className="bo-panel bo-setting-card"><div className="bo-setting-icon"><Bot size={21}/></div><div><div className="bo-small-kicker">AI ASSISTANT</div><h3>Your preferred model</h3><p>Choose the AI model used when you ask BUILDA to explain a tender. Models have different availability and usage costs.</p><label>Model<select value={model} onChange={e => setModel(e.target.value)}>{!models.some(m=>m.id===model) && <option value={model}>{model}</option>}{models.map(m => <option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></label><button className="bo-primary" disabled={modelSaving} onClick={() => void saveModel()}>{modelSaving ? 'Saving…' : 'Save model preference'} <Check size={16}/></button></div></section><section className="bo-panel bo-setting-card"><div className="bo-setting-icon"><LockKeyhole size={21}/></div><div><div className="bo-small-kicker">ACCOUNT & PRIVACY</div><h3>Account</h3><p>Signed in as <strong>{user.email}</strong>. Your company profile, saved opportunities and file metadata are stored in private Firestore paths.</p><button className="bo-outline" onClick={leave}><LogOut size={16}/> Sign out of BUILDA</button></div></section><section className="bo-panel bo-setting-card"><div className="bo-setting-icon"><BookOpenText size={21}/></div><div><div className="bo-small-kicker">DATA PROVENANCE</div><h3>Government tender data</h3><p>Publicly available OCDS procurement releases from South Africa's National Treasury. The data is incomplete and may be delayed, so use original notices to make decisions.</p><a className="bo-link" href="https://data.etenders.gov.za/" target="_blank" rel="noreferrer">Visit transparency portal <ExternalLink size={15}/></a></div></section></div></>}
        <div className="bo-footer"><span>BUILDA · MADE FOR THE BUSINESSES BUILDING TOMORROW</span><span>South Africa · © {new Date().getFullYear()}</span></div>
      </div>
    </div>
    {selected && <div className="bo-dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}><section className="bo-dialog" role="dialog" aria-modal="true" aria-label="Tender details"><div className="bo-dialog-top"><div><span className="bo-small-kicker">TENDER INTELLIGENCE / NOTICE DETAILS</span><div className="bo-dialog-meta">{selected.reference || selected.id} <span>·</span> <Status value={tenderStatus(selected)}/></div></div><button className="bo-icon-button" onClick={() => setSelected(null)} aria-label="Close tender"><X size={20}/></button></div><div className="bo-dialog-body"><h2>{selected.title}</h2>{profileReady && <div className="bo-dialog-match"><MatchTag tender={selected}/><span>{(matchMap.get(selected.id) || matchTender(selected, profile)).reasons.join(' · ') || 'Limited data is available for matching.'}</span>{(matchMap.get(selected.id) || matchTender(selected, profile)).warning && <small>{(matchMap.get(selected.id) || matchTender(selected, profile)).warning}</small>}</div>}<p className="bo-dialog-desc">{selected.description || 'No public description provided.'}</p><div className="bo-detail-grid"><div><span>ISSUING ORGANISATION</span><strong>{selected.buyer}</strong></div><div><span>PROVINCE / LOCATION</span><strong>{selected.province}</strong></div><div><span>CLOSING DATE</span><strong>{formattedDate(selected.closesAt)}</strong></div><div><span>PUBLICATION DATE</span><strong>{formattedDate(selected.publishedAt)}</strong></div></div>{selected.eligibility && <div className="bo-detail-section"><h3>Published eligibility criteria</h3><p>{selected.eligibility}</p></div>}{selected.specialConditions && <div className="bo-detail-section"><h3>Special conditions</h3><p>{selected.specialConditions}</p></div>}{selected.briefing && <div className="bo-detail-section"><h3>Briefing session {selected.briefing.compulsory ? '· Listed as compulsory' : ''}</h3><p>{selected.briefing.date || 'Date not specified'} · {selected.briefing.venue || 'Venue not specified'}</p></div>}{selected.submission && <div className="bo-detail-section"><h3>Submission information</h3><p>{selected.submission}</p></div>}
    {selected.documents.length > 0 && <div className="bo-detail-section"><h3>Published tender documents</h3><div className="bo-doc-links">{selected.documents.map((d,i) => <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"><FileText size={15}/>{d.title}<ExternalLink size={14}/></a>)}</div></div>}
    <div className="bo-ai-explainer"><div className="bo-ai-header"><IconWrap tone="purple"><Sparkles size={20}/></IconWrap><div><strong>Make this tender understandable</strong><p>BUILDA explains what the buyer needs, the requirements published and what to check next.</p></div></div>{analysis ? <div className="bo-ai-answer">{analysis}</div> : <button className="bo-primary" disabled={analysing} onClick={() => void explain(selected)}><Sparkles size={16}/>{analysing ? 'Analysing notice…' : 'Explain with AI'} <ArrowRight size={16}/></button>}{aiError && <div className="bo-inline-error">{aiError}</div>}<small>AI-assisted information, not a qualification decision. Verify original procurement documents.</small></div>
    <p className="bo-source-disclaimer">Source: National Treasury eTenders OCDS public releases. Publication coverage is not complete; dates and documents may change.</p></div><div className="bo-dialog-actions"><button className="bo-outline" onClick={() => void toggleSaved(selected)}><Star size={16} fill={savedIds.has(selected.id) ? 'currentColor' : 'none'}/>{savedIds.has(selected.id) ? 'Remove saved' : 'Save opportunity'}</button><a className="bo-primary" href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Original portal <ExternalLink size={16}/></a></div></section></div>}
  </div>;
}