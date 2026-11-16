import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { signOut } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  ArrowRight, ArrowUpRight, Bell, BookOpenText, Bot, BriefcaseBusiness,
  Building2, Check, CheckCircle2, ChevronRight, ClipboardCheck, Clock3,
  FilePenLine, FolderOpen, HeartHandshake, LayoutDashboard, LockKeyhole,
  LogOut, Menu, Moon, Plus, Settings2, ShieldCheck, Sparkles, Sun, X
} from 'lucide-react';
import { auth, db } from '../firebase';
import DocumentVault from './DocumentVault';
import type { VaultFile } from './DocumentVault';
import AssistantHub from './AssistantHub';
import './workspace.css';

type View = 'overview' | 'opportunities' | 'documents' | 'creator' | 'applications' | 'company' | 'assistant' | 'settings';
type Theme = 'light' | 'dark';
type Organisation = Record<string, string>;
type Model = { id: string; name: string; promptPrice?: number; completionPrice?: number };
const views: View[] = ['overview', 'opportunities', 'documents', 'creator', 'applications', 'company', 'assistant', 'settings'];
const provinces = ['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West'];
const focusAreas = ['Youth development', 'Education and skills', 'Community development', 'Food security', 'Health and wellbeing', 'Women empowerment', 'Disability inclusion', 'Environmental conservation', 'Sport and recreation', 'Arts and culture', 'Human rights', 'Economic empowerment', 'Other'];
const profileFields = ['name', 'registration', 'description', 'category', 'province', 'coverage', 'services', 'beneficiaries', 'projects', 'goals'];
const editableFields = [
  'name', 'tradingName', 'registration', 'npcNumber', 'pboNumber', 'yearEstablished',
  'contactPerson', 'phone', 'whatsapp', 'website', 'description', 'category',
  'province', 'city', 'coverage', 'services', 'beneficiaries', 'projects',
  'goals', 'fundingPriorities'
];
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const daysUntil = (text: string | undefined) => {
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
};
const displayDate = (text?: string) => {
  if (!text) return 'No date provided';
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
};
async function api<T>(user: User, path: string, body?: unknown): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request failed. Please try again.');
  return result as T;
}
function IconWrap({ children, tone = 'green' }: { children: React.ReactNode; tone?: string }) {
  return <span className={'bo-icon bo-icon-' + tone}>{children}</span>;
}
function Heading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="bo-page-heading"><div><div className="bo-eyebrow"><span className="bo-live-dot"/>{eyebrow}</div><h1>{title}<span className="bo-heading-dot">.</span></h1><p>{subtitle}</p></div>{action}</div>;
}
function PlannedFeature({ icon, kicker, title, body, steps, action }: {
  icon: React.ReactNode; kicker: string; title: string; body: string;
  steps: string[]; action: React.ReactNode;
}) {
  return <section className="bo-npo-future">
    <div className="bo-npo-future-icon">{icon}</div>
    <div className="bo-small-kicker">{kicker}</div>
    <h2>{title}</h2><p>{body}</p>
    <div className="bo-npo-future-steps">{steps.map(step => <div key={step}><Check size={15}/>{step}</div>)}</div>
    <div className="bo-npo-future-actions">{action}</div>
  </section>;
}

export default function Workspace({ user, onExit }: { user: User; onExit: () => void }) {
  const rawPath = window.location.pathname.replace(/^\/app\/?/, '').split('/')[0];
  const initialView = rawPath === 'tenders' || rawPath === 'saved' ? 'opportunities' : rawPath;
  const [view, setView] = useState<View>(views.includes(initialView as View) ? initialView as View : 'overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<Organisation>({});
  const [draft, setDraft] = useState<Organisation>({});
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [vaultLoading, setVaultLoading] = useState(true);
  const [vaultError, setVaultError] = useState('');
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [notice, setNotice] = useState('');
  const [model, setModel] = useState('openrouter/free');
  const [models, setModels] = useState<Model[]>([{ id: 'openrouter/free', name: 'Free auto · OpenRouter' }]);
  const [modelSaving, setModelSaving] = useState(false);
  const [aiCheck, setAiCheck] = useState<{ busy: boolean; success: boolean; message: string }>({ busy: false, success: false, message: '' });
  const [theme, setTheme] = useState<Theme>(() => {
    try { const saved = localStorage.getItem('oppotron-theme'); if (saved === 'light' || saved === 'dark') return saved; } catch { /* local preference unavailable */ }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const changeView = (next: View) => {
    setView(next); setNotice(''); setSidebarOpen(false);
    const path = next === 'overview' ? '/app' : '/app/' + next;
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  useEffect(() => {
    const onBack = () => {
      const segment = window.location.pathname.replace(/^\/app\/?/, '').split('/')[0];
      const next = segment === 'tenders' || segment === 'saved' ? 'opportunities' : segment;
      setView(views.includes(next as View) ? next as View : 'overview');
      setSidebarOpen(false);
    };
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, []);
  useEffect(() => {
    try { localStorage.setItem('oppotron-theme', theme); } catch { /* local preference unavailable */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101b20' : '#f6f8f7');
  }, [theme]);
  useEffect(() => {
    if (!db) {
      setProfileLoading(false); setVaultLoading(false);
      setProfileError('Firestore is not configured. Check the project settings.');
      setVaultError('Firestore is not configured.'); return;
    }
    let active = true;
    getDoc(doc(db, 'contractors', user.uid)).then(snap => {
      if (!active) return;
      const value = snap.exists() ? snap.data() as Organisation : {};
      setProfile(value); setDraft(value); setProfileError(''); setProfileLoading(false);
    }).catch(() => {
      if (active) { setProfileLoading(false); setProfileError('Could not access your organisation record. Check the published Firebase security rules.'); }
    });
    getDoc(doc(db, 'contractors', user.uid, 'settings', 'preferences')).then(snap => {
      if (active && snap.exists() && typeof snap.data().model === 'string') setModel(snap.data().model);
    }).catch(() => { /* optional preference */ });
    const stopFiles = onSnapshot(collection(db, 'contractors', user.uid, 'documents'), snapshot => {
      if (!active) return;
      setFiles(snapshot.docs.map(item => ({ ...item.data(), id: item.id } as VaultFile)).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setVaultLoading(false); setVaultError('');
    }, () => {
      if (active) { setVaultLoading(false); setVaultError('Document metadata is unavailable. No files were deleted. Check Firestore rules.'); }
    });
    return () => { active = false; stopFiles(); };
  }, [user.uid]);
  useEffect(() => {
    if (view !== 'settings') return;
    api<{ models: Model[] }>(user, '/api/models').then(result => { if (result.models.length) setModels(result.models); }).catch(() => {});
  }, [view, user.uid]);

  const count = profileFields.filter(key => profile[key]?.trim()).length;
  const profilePct = Math.round(count / profileFields.length * 100);
  const expirySoon = useMemo(() => files.filter(file => { const days = daysUntil(file.expiresAt); return days !== null && days <= 30; }), [files]);
  const completedProfile = count >= 4;
  const organisationName = profile.tradingName || profile.name || 'Your organisation';
  const displayName = profile.contactPerson?.trim().split(' ')[0] || 'there';
  const missingDocuments = ['NPO registration certificate', 'Constitution', 'Organisation profile', 'Financial statements']
    .filter(term => !files.some(f => (f.name + ' ' + f.category).toLowerCase().includes(term.split(' ')[0].toLowerCase())));
  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!db || !draft.name?.trim()) { setProfileError('Please enter your organisation name.'); return; }
    setProfileSaving(true); setProfileError('');
    try {
      const patch = Object.fromEntries(editableFields.map(key => [key, String(draft[key] || '').slice(0, key === 'description' || key === 'projects' || key === 'services' ? 4000 : 1500)]));
      await setDoc(doc(db, 'contractors', user.uid), { ...patch, ownerId: user.uid, organizationType: 'npo', email: user.email || '', updatedAt: serverTimestamp() }, { merge: true });
      setProfile(previous => ({ ...previous, ...patch, organizationType: 'npo' }));
      setNotice('Organisation profile saved. OPPOTRON will use these details to tailor future assistance.');
    } catch { setProfileError('Unable to save your profile. Publish the latest Firestore rules and retry.'); }
    finally { setProfileSaving(false); }
  };
  const saveModel = async () => {
    if (!db) return;
    setModelSaving(true);
    try {
      await setDoc(doc(db, 'contractors', user.uid, 'settings', 'preferences'), { model, updatedAt: serverTimestamp() }, { merge: true });
      setNotice('Your AI model preference was saved.');
    } catch { setNotice('Model preference could not be saved. Check Firestore permissions.'); }
    finally { setModelSaving(false); }
  };
  const testAI = async () => {
    setAiCheck({ busy: true, success: false, message: '' });
    try {
      const response = await api<{ model: string; fallback?: boolean }>(user, '/api/assistant', {
        model, company: profile, documents: files,
        messages: [{ role: 'user', content: 'Confirm in one sentence that the OPPOTRON fundraising assistant is responding.' }]
      });
      setAiCheck({ busy: false, success: true, message: 'AI responded using ' + response.model + (response.fallback ? ' (free fallback)' : '') + '.' });
    } catch (error) {
      setAiCheck({ busy: false, success: false, message: error instanceof Error ? error.message : 'Could not contact the AI service.' });
    }
  };
  const leave = async () => {
    try { if (auth) await signOut(auth); onExit(); } catch { setNotice('Unable to sign out. Please retry.'); }
  };
  const nav: { label: string; items: { id: View; label: string; icon: React.ReactNode }[] }[] = [
    { label: 'FUNDRAISING WORKSPACE', items: [
      { id: 'overview', label: 'Home', icon: <LayoutDashboard size={18}/> },
      { id: 'opportunities', label: 'Opportunities', icon: <HeartHandshake size={18}/> },
      { id: 'documents', label: 'Documents', icon: <FolderOpen size={18}/> },
      { id: 'creator', label: 'Document Creator', icon: <FilePenLine size={18}/> },
      { id: 'applications', label: 'Applications', icon: <ClipboardCheck size={18}/> },
      { id: 'assistant', label: 'OPPOTRON Assistant', icon: <Bot size={18}/> }
    ] },
    { label: 'YOUR ORGANISATION', items: [
      { id: 'company', label: 'Organisation', icon: <Building2 size={18}/> },
      { id: 'settings', label: 'Settings', icon: <Settings2 size={18}/> }
    ] }
  ];

  return <div className={'bo-shell bo-theme-' + theme + (view === 'assistant' ? ' bo-assistant-view' : '')}>
    {sidebarOpen && <button className="bo-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}/>}
    <aside className={'bo-sidebar ' + (sidebarOpen ? 'bo-sidebar-open' : '')}>
      <div className="bo-brand"><span className="bo-brand-mark">o<span>.</span></span><span className="bo-brand-word">oppotron<span>.</span><small>FUNDRAISING WORKSPACE</small></span><button className="bo-close-nav" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={20}/></button></div>
      <div className="bo-nav-section">{nav.map(group => <div key={group.label}><div className="bo-nav-label">{group.label}</div>{group.items.map(item => <button key={item.id} className={'bo-nav-item ' + (view === item.id ? 'active' : '')} onClick={() => changeView(item.id)}>{item.icon}<span>{item.label}</span></button>)}</div>)}</div>
      <div className="bo-sidebar-bottom"><button className="bo-signout" onClick={() => void leave()}><LogOut size={17}/> Sign out</button><div className="bo-version">OPPOTRON · FOR NONPROFITS</div></div>
    </aside>
    <div className="bo-main">
      <div className="bo-topbar"><div className="bo-top-left"><button className="bo-mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={21}/></button><span className="bo-breadcrumb">Your workspace</span><ChevronRight size={14}/><strong>{nav.flatMap(group => group.items).find(item => item.id === view)?.label || 'Home'}</strong></div><div className="bo-top-right"><button className="bo-top-assistant-link" onClick={() => changeView('assistant')}><Sparkles size={16}/> <span>Ask OPPOTRON</span></button><span className="bo-top-divider"/><button className="bo-theme-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button><span className="bo-avatar" title={user.email || ''}>{organisationName.charAt(0).toUpperCase()}</span></div></div>
      <div className={'bo-content ' + (view === 'assistant' ? 'bo-content-assistant' : '')}>
        {notice && <div className="bo-toast" role="status"><CheckCircle2 size={17}/><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={15}/></button></div>}
        {view === 'overview' && <>
          <Heading eyebrow="YOUR FUNDRAISING DESK" title={greeting() + ', ' + displayName} subtitle="Your funding. Your documents. Your future." action={<button className="bo-primary" onClick={() => changeView('assistant')}><Sparkles size={16}/> Ask your assistant <ArrowUpRight size={16}/></button>}/>
          {profileError && <div className="bo-inline-error" role="alert">{profileError} <button onClick={() => window.location.reload()}>Retry</button></div>}
          <div className="bo-metrics bo-npo-metrics">
            <button className="bo-metric" onClick={() => changeView('company')}><div><span>Profile completeness</span><IconWrap tone="green"><Building2 size={19}/></IconWrap></div><strong>{profileLoading ? '—' : profilePct + '%'}</strong><small>{count} of {profileFields.length} essential profile details supplied — not compliance certification</small><div className="bo-progress"><span style={{width:profilePct + '%'}}/></div></button>
            <button className="bo-metric" onClick={() => changeView('documents')}><div><span>Documents stored</span><IconWrap tone="blue"><FolderOpen size={19}/></IconWrap></div><strong>{vaultLoading ? '—' : files.length}</strong><small>{vaultError ? 'Document records unavailable' : 'Securely stored in your private vault'}</small><span className="bo-metric-link">Open vault <ArrowUpRight size={14}/></span></button>
            <button className="bo-metric" onClick={() => changeView('documents')}><div><span>Expiry dates to review</span><IconWrap tone="amber"><Clock3 size={19}/></IconWrap></div><strong>{vaultLoading ? '—' : expirySoon.length}</strong><small>Dates supplied for documents expired or due in 30 days</small><span className="bo-metric-link">Review documents <ArrowUpRight size={14}/></span></button>
          </div>
          <div className="bo-npo-dashboard-grid">
            <section className="bo-panel bo-npo-next"><div className="bo-panel-title"><div><div className="bo-small-kicker">YOUR NEXT STEPS</div><h3>Keep your organisation funding-ready</h3><p>Simple actions you can take now. These are suggestions, not verified funder requirements.</p></div><IconWrap tone="amber"><Bell size={19}/></IconWrap></div>
              <div className="bo-attention-list">
                {!completedProfile && <button onClick={() => changeView('company')}><span className="bo-attention-symbol"><Building2 size={18}/></span><span><strong>Tell OPPOTRON about your NPO</strong><small>Add your mission, programmes, focus areas and beneficiaries</small></span><ArrowUpRight size={16}/></button>}
                {files.length === 0 && <button onClick={() => changeView('documents')}><span className="bo-attention-symbol"><FolderOpen size={18}/></span><span><strong>Start your document vault</strong><small>Keep registration, constitution and financial documents together</small></span><ArrowUpRight size={16}/></button>}
                {expirySoon.slice(0,3).map(file => <button key={file.id} onClick={() => changeView('documents')}><span className="bo-attention-symbol"><Clock3 size={18}/></span><span><strong>Review {file.name}</strong><small>Recorded expiry: {displayDate(file.expiresAt)}</small></span><ArrowUpRight size={16}/></button>)}
                {completedProfile && files.length > 0 && !expirySoon.length && <button onClick={() => changeView('assistant')}><span className="bo-attention-symbol"><Sparkles size={18}/></span><span><strong>Prepare for your next funding call</strong><small>Ask OPPOTRON for a requirements checklist or proposal outline</small></span><ArrowUpRight size={16}/></button>}
              </div><div className="bo-attention-foot"><ShieldCheck size={16}/> Your records remain private to your account.</div>
            </section>
            <section className="bo-panel bo-npo-brief"><div className="bo-panel-title"><div><div className="bo-small-kicker">YOUR FUNDRAISING ADMIN ASSISTANT</div><h3>Less paperwork. More purpose.</h3><p>Get help understanding funding applications and organising next steps.</p></div><IconWrap tone="purple"><Bot size={19}/></IconWrap></div>
              <div className="bo-npo-brief-body"><span className="bo-npo-brief-spark"><Sparkles size={27}/></span><h3>What would you like help with today?</h3><p>Ask about grant requirements, CSI programmes, an application checklist or a funding proposal outline. Your organisation profile provides the context.</p><button className="bo-primary" onClick={() => changeView('assistant')}>Open your AI assistant <ArrowRight size={16}/></button></div>
            </section>
          </div>
          <div className="bo-npo-four-pillar"><div className="bo-small-kicker">YOUR FUNDRAISING WORKSPACE</div><div className="bo-npo-pillar-grid">
            <button onClick={() => changeView('documents')}><FolderOpen size={19}/><strong>Document vault</strong><span>Organise and track records</span><ArrowRight size={15}/></button>
            <button onClick={() => changeView('opportunities')}><HeartHandshake size={19}/><strong>Funding opportunities</strong><span>Grants and CSI intelligence</span><ArrowRight size={15}/></button>
            <button onClick={() => changeView('creator')}><FilePenLine size={19}/><strong>Document creator</strong><span>Professional funding documents</span><ArrowRight size={15}/></button>
            <button onClick={() => changeView('applications')}><ClipboardCheck size={19}/><strong>Applications</strong><span>Prepare and track packages</span><ArrowRight size={15}/></button>
          </div></div>
        </>}
        {view === 'opportunities' && <>
          <Heading eyebrow="FUNDING DISCOVERY" title="Funding opportunities" subtitle="Grants, CSI programmes, foundations and funding partners — relevant to your NPO."/>
          <PlannedFeature icon={<HeartHandshake size={31}/>} kicker="FUNDING SOURCE INTEGRATIONS — COMING NEXT" title="Your funding feed is taking shape." body="We’ve removed the unrelated public tender feed. Verified grants, corporate CSI programmes and foundation opportunities will appear here once the funding-source framework is connected. We won’t show invented matches or deadlines." steps={['A personalised funding feed based on your organisation’s mission and programmes','Verified source links, criteria and application deadlines','Clear AI explanations of each opportunity and its requirements']} action={<><button className="bo-primary" onClick={() => changeView('company')}>Complete NPO profile <ArrowRight size={16}/></button><button className="bo-outline" onClick={() => changeView('assistant')}>Decode a funding call with AI <Sparkles size={16}/></button></>}/>
        </>}
        {view === 'documents' && <DocumentVault user={user} files={files} loading={vaultLoading} error={vaultError} onNotice={setNotice}/>}
        {view === 'creator' && <>
          <Heading eyebrow="AI DOCUMENT WORKSPACE" title="Document Creator" subtitle="Prepare professional funding documents using your organisation’s information."/>
          <PlannedFeature icon={<FilePenLine size={31}/>} kicker="TIPTAP EDITOR — UPCOMING" title="Your fundraising writing desk." body="The dedicated rich-text editor, document library and PDF/Word export will be added here. OPPOTRON can already help create a proposal outline or first draft in the AI assistant, using the information you’ve provided without inventing budgets or outcomes." steps={['AI-assisted funding proposals and letters of support','Editable, formatted documents powered by Tiptap','Save drafts and export approved documents as PDF or Word']} action={<button className="bo-primary" onClick={() => changeView('assistant')}>Draft with OPPOTRON now <ArrowRight size={16}/></button>}/>
        </>}
        {view === 'applications' && <>
          <Heading eyebrow="FUNDING APPLICATION WORKFLOW" title="Applications" subtitle="Prepare, review and eventually track funding applications in one place."/>
          <PlannedFeature icon={<ClipboardCheck size={31}/>} kicker="APPLICATION TRACKING — UPCOMING" title="Every application, organised." body="The applications workspace is being built around human-approved submissions. Tracking and automatic form submission are not active yet. For now your assistant can help you create an application checklist from a funding call you provide." steps={['Requirement checklists based on original funder instructions','Reusable documents and approval checkpoints','Deadlines, statuses and outcomes once tracking is available']} action={<button className="bo-primary" onClick={() => changeView('assistant')}>Ask for an application checklist <ArrowRight size={16}/></button>}/>
        </>}
        {view === 'assistant' && <AssistantHub user={user} organisation={{...profile, organizationType: 'npo'}} documents={files} model={model} onViewProfile={() => changeView('company')}/>}
        {view === 'company' && <>
          <Heading eyebrow="YOUR ORGANISATION KNOWLEDGE BASE" title="Organisation profile" subtitle="Tell OPPOTRON about your NPO once. This information will support document preparation, funding matches and application readiness." action={<span className="bo-private"><LockKeyhole size={14}/> Private NPO profile</span>}/>
          <div className="bo-company-grid">
            <section className="bo-panel bo-profile-card">
              <div className="bo-panel-title"><div><div className="bo-small-kicker">NONPROFIT ORGANISATION DETAILS</div><h3>Your organisation information</h3><p>Every field helps OPPOTRON understand your mission. Only the name is required to save.</p></div></div>
              {profileError && <div className="bo-inline-error" role="alert">{profileError}</div>}
              <form onSubmit={saveProfile} className="bo-company-form">
                <div className="bo-npo-form-group-heading"><span>01</span><div><strong>Identity & registration</strong><small>Who you are and how you’re registered</small></div></div>
                <div className="bo-form-row">
                  <label>Registered organisation name *<input required maxLength={200} autoComplete="organization" value={draft.name || ''} onChange={e => setDraft(p=>({...p,name:e.target.value}))}/></label>
                  <label>Common or operating name<input maxLength={200} value={draft.tradingName || ''} onChange={e => setDraft(p=>({...p,tradingName:e.target.value}))}/></label>
                </div>
                <div className="bo-form-row">
                  <label>NPO registration number<input value={draft.registration || ''} onChange={e => setDraft(p=>({...p,registration:e.target.value}))} placeholder="If registered with DSD"/></label>
                  <label>NPC registration number (optional)<input value={draft.npcNumber || ''} onChange={e => setDraft(p=>({...p,npcNumber:e.target.value}))}/></label>
                </div>
                <div className="bo-form-row">
                  <label>PBO reference number (optional)<input value={draft.pboNumber || ''} onChange={e => setDraft(p=>({...p,pboNumber:e.target.value}))}/></label>
                  <label>Year established (optional)<input inputMode="numeric" maxLength={4} value={draft.yearEstablished || ''} onChange={e => setDraft(p=>({...p,yearEstablished:e.target.value}))} placeholder="e.g. 2014"/></label>
                </div>
                <div className="bo-npo-form-group-heading"><span>02</span><div><strong>Mission & programmes</strong><small>What you do and who benefits</small></div></div>
                <label>Organisation mission and purpose<textarea rows={4} maxLength={4000} value={draft.description || ''} onChange={e => setDraft(p=>({...p,description:e.target.value}))} placeholder="What change does your NPO exist to make?"/></label>
                <div className="bo-form-row">
                  <label>Primary focus area<select value={draft.category || ''} onChange={e => setDraft(p=>({...p,category:e.target.value}))}><option value="">Choose a focus area</option>{focusAreas.map(area=><option key={area} value={area}>{area}</option>)}</select></label>
                  <label>Who do you serve?<input value={draft.beneficiaries || ''} onChange={e => setDraft(p=>({...p,beneficiaries:e.target.value}))} placeholder="e.g. young people aged 12–25"/></label>
                </div>
                <label>Programmes and activities<textarea rows={4} maxLength={4000} value={draft.services || ''} onChange={e => setDraft(p=>({...p,services:e.target.value}))} placeholder="Describe the programmes your organisation delivers"/></label>
                <label>Past work, outcomes and verified achievements<textarea rows={4} maxLength={4000} value={draft.projects || ''} onChange={e => setDraft(p=>({...p,projects:e.target.value}))} placeholder="Include only achievements, beneficiary numbers or results you can substantiate"/></label>
                <div className="bo-npo-form-group-heading"><span>03</span><div><strong>Where you operate</strong><small>Location and community reach</small></div></div>
                <div className="bo-form-row">
                  <label>Province<select value={draft.province || ''} onChange={e => setDraft(p=>({...p,province:e.target.value}))}><option value="">Select province</option>{provinces.map(p=><option key={p}>{p}</option>)}</select></label>
                  <label>City or town<input value={draft.city || ''} onChange={e => setDraft(p=>({...p,city:e.target.value}))}/></label>
                </div>
                <label>Areas and communities served<textarea rows={2} value={draft.coverage || ''} onChange={e => setDraft(p=>({...p,coverage:e.target.value}))} placeholder="e.g. Soweto, Johannesburg and nearby communities"/></label>
                <div className="bo-npo-form-group-heading"><span>04</span><div><strong>Fundraising priorities</strong><small>The support you need to make an impact</small></div></div>
                <label>Funding goals and planned work<textarea rows={3} value={draft.goals || ''} onChange={e => setDraft(p=>({...p,goals:e.target.value}))} placeholder="What would you like funding to help you accomplish?"/></label>
                <label>Priority funding needs<textarea rows={3} value={draft.fundingPriorities || ''} onChange={e => setDraft(p=>({...p,fundingPriorities:e.target.value}))} placeholder="e.g. programme materials, salaries, transport, equipment"/></label>
                <div className="bo-npo-form-group-heading"><span>05</span><div><strong>Contact information</strong><small>For your own administration records</small></div></div>
                <div className="bo-form-row">
                  <label>Contact person<input autoComplete="name" value={draft.contactPerson || ''} onChange={e => setDraft(p=>({...p,contactPerson:e.target.value}))}/></label>
                  <label>Telephone<input type="tel" autoComplete="tel" value={draft.phone || ''} onChange={e => setDraft(p=>({...p,phone:e.target.value}))}/></label>
                </div>
                <div className="bo-form-row">
                  <label>WhatsApp (optional)<input type="tel" value={draft.whatsapp || ''} onChange={e => setDraft(p=>({...p,whatsapp:e.target.value}))}/></label>
                  <label>Website (optional)<input type="url" autoComplete="url" value={draft.website || ''} onChange={e => setDraft(p=>({...p,website:e.target.value}))} placeholder="https://"/></label>
                </div>
                <div className="bo-form-footer"><span><LockKeyhole size={14}/> Your NPO details are private to your account.</span><button className="bo-primary" type="submit" disabled={profileSaving || profileLoading}>{profileSaving ? 'Saving…' : 'Save organisation profile'} <Check size={16}/></button></div>
              </form>
            </section>
            <aside className="bo-profile-aside">
              <div className="bo-panel bo-profile-score"><div className="bo-small-kicker">PROFILE COMPLETENESS</div><h3>Build your organisation knowledge base.</h3><div className="bo-big-score">{profilePct}<span>%</span></div><div className="bo-progress"><span style={{width: profilePct+'%'}}/></div><p>{count} of {profileFields.length} profile details supplied. This is not a compliance or funding-readiness score.</p><div className="bo-score-items">{profileFields.slice(0,7).map(field => <div key={field}><span className={profile[field]?.trim() ? 'complete' : ''}>{profile[field]?.trim() ? <Check size={14}/> : <span/>}</span>{({name:'Organisation name',registration:'NPO registration',description:'Mission',category:'Focus area',province:'Province',coverage:'Communities served',services:'Programmes'} as Record<string,string>)[field] || field}</div>)}</div></div>
              <div className="bo-profile-hint"><ShieldCheck size={19}/><strong>One source of truth</strong><p>Your profile will be the context for future funding matches, document drafts and applications. OPPOTRON must never invent missing facts or financial results.</p></div>
            </aside>
          </div>
        </>}
        {view === 'settings' && <>
          <Heading eyebrow="PERSONALISE YOUR WORKSPACE" title="Settings" subtitle="Appearance, AI model and account preferences."/>
          <div className="bo-settings-stack">
            <section className="bo-panel bo-setting-card"><div className="bo-setting-icon">{theme === 'dark' ? <Moon size={21}/> : <Sun size={21}/>}</div><div><div className="bo-small-kicker">APPEARANCE</div><h3>Workspace theme</h3><p>Choose how OPPOTRON looks on this device.</p><div className="bo-theme-options"><button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}><Sun size={17}/> Light</button><button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}><Moon size={17}/> Dark</button></div></div></section>
            <section className="bo-panel bo-setting-card"><div className="bo-setting-icon"><Bot size={21}/></div><div><div className="bo-small-kicker">AI FUNDRAISING ASSISTANT</div><h3>AI model</h3><p>Choose the model used by your fundraising assistant. A free fallback may be used if a selected provider is unavailable.</p><label>Preferred model<select value={model} onChange={e => setModel(e.target.value)}>{!models.some(m=>m.id===model) && <option value={model}>{model}</option>}{models.map(m => <option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></label><div className="bo-npo-settings-actions"><button className="bo-primary" onClick={() => void saveModel()} disabled={modelSaving}>{modelSaving ? 'Saving…' : 'Save model preference'} <Check size={16}/></button><button className="bo-outline" onClick={() => void testAI()} disabled={aiCheck.busy}><Bot size={16}/>{aiCheck.busy ? 'Testing…' : 'Test AI connection'}</button></div>{aiCheck.message && <div role="status" className={aiCheck.success ? 'bo-ai-test-good' : 'bo-inline-error'}>{aiCheck.message}</div>}</div></section>
            <section className="bo-panel bo-setting-card"><div className="bo-setting-icon"><LockKeyhole size={21}/></div><div><div className="bo-small-kicker">ACCOUNT PRIVACY</div><h3>Protected organisation workspace</h3><p>Signed in as <strong>{user.email}</strong>. Your organisation profile, uploaded documents and chat history are scoped to your signed-in account.</p></div></section>
          </div>
        </>}
        {view !== 'assistant' && <div className="bo-footer"><span>OPPOTRON · YOUR FUNDING. YOUR DOCUMENTS. YOUR FUTURE.</span><span>South Africa · © {new Date().getFullYear()}</span></div>}
      </div>
    </div>
    {view !== 'assistant' && <button className="op-chat-fab" onClick={() => changeView('assistant')} aria-label="Chat with OPPOTRON"><span className="op-chat-fab-icon"><Bot size={21}/></span><span>Ask OPPOTRON</span></button>}
  </div>;
}
