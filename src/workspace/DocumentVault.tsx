import React, { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  ArrowDownToLine, ArrowRight, Check, CloudUpload,
  FileText, FolderOpen, LockKeyhole, Plus, Trash2, UploadCloud, X
} from 'lucide-react';
import { db } from '../firebase';
import './documents.css';

export type VaultFile = {
  id: string; key: string; name: string; originalName?: string; description?: string;
  type: string; size: number; category: string; expiresAt: string;
  createdAt?: { seconds: number };
};
type UploadDraft = {
  id: string; file: File; name: string; description: string;
  category: string; expiresAt: string; status: 'ready' | 'uploading' | 'saved' | 'error'; error?: string;
};
type Props = {
  user: User; files: VaultFile[]; loading: boolean; error: string;
  onNotice: (message: string) => void;
};
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 12;
const ACCEPTED: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
const categories = ['NPO registration', 'NPC incorporation', 'PBO / tax exemption', 'Constitution', 'Organisation profile', 'Financial statements', 'Annual reports', 'Governance & board', 'Programme & impact reports', 'Budgets & funding proposals', 'Policies & compliance', 'Letters & supporting documents', 'Other'];
const sizeText = (n: number) => n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const dateText = (date?: string) => date ? new Date(date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not specified';
const fileDate = (date?: { seconds: number }) => date?.seconds ? new Date(date.seconds * 1000).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Just added';
async function documentApi<T>(user: User, path: string, options: RequestInit = {}): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(path, {
    ...options, headers: { Authorization: 'Bearer ' + token, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed. Please retry.');
  return data as T;
}

export default function DocumentVault({ user, files, loading, error, onNotice }: Props) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<VaultFile | null>(null);
  const [drafts, setDrafts] = useState<UploadDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const picker = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);

  const closeUpload = () => {
    if (busy) return;
    setUploadOpen(false); setDrafts([]); setBatchError(''); setProgress({ done: 0, total: 0 });
  };
  const queueFiles = (incoming: FileList | File[]) => {
    const items = Array.from(incoming);
    if (!items.length) return;
    if (items.length + drafts.length > MAX_FILES) setBatchError('Upload up to ' + MAX_FILES + ' documents per batch.');
    else setBatchError('');
    setDrafts(current => {
      const room = Math.max(0, MAX_FILES - current.length);
      // A maximum of twelve documents can be queued at once.
      return [...current, ...items.slice(0, room).map(file => {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const valid = Boolean(ACCEPTED[ext]) && file.size > 0 && file.size <= MAX_BYTES;
        return {
          id: crypto.randomUUID(), file,
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 110), description: '',
          category: 'Other', expiresAt: '', status: valid ? 'ready' as const : 'error' as const,
          error: valid ? '' : 'PDF, image, Word or Excel files up to 15 MB only.'
        };
      })];
    });
    if (picker.current) picker.current.value = '';
  };
  const updateDraft = (id: string, patch: Partial<UploadDraft>) => {
    setDrafts(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  };
  const uploadBatch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!db || loading || error || busy || !drafts.length) return;
    const pending = drafts.filter(d => d.status !== 'saved');
    if (pending.some(d => !ACCEPTED[(d.file.name.split('.').pop() || '').toLowerCase()] || d.file.size > MAX_BYTES || d.file.size === 0)) {
      setBatchError('Remove unsupported or oversized files before continuing.'); return;
    }
    if (pending.some(d => !d.name.trim() || d.name.trim().length > 110 || d.description.length > 1000)) {
      setBatchError('Every document needs a name (up to 110 characters) and descriptions must be under 1,000 characters.'); return;
    }
    setBusy(true); setBatchError(''); setProgress({ done: 0, total: pending.length });
    let completed = 0; let rejected = 0;
    for (const item of pending) {
      updateDraft(item.id, { status: 'uploading', error: '' });
      let key: string | null = null;
      try {
        const ext = (item.file.name.split('.').pop() || '').toLowerCase();
        const signed = await documentApi<{ url: string; id: string; key: string; name: string; type: string }>(
          user, '/api/documents', {
            method: 'POST', body: JSON.stringify({ name: item.file.name, type: ACCEPTED[ext], size: item.file.size })
          });
        const put = await fetch(signed.url, { method: 'PUT', headers: { 'Content-Type': signed.type }, body: item.file });
        if (!put.ok) throw new Error('Cloud storage rejected the upload. Verify the R2 bucket CORS settings.');
        key = signed.key;
        await setDoc(doc(db, 'contractors', user.uid, 'documents', signed.id), {
          ownerId: user.uid,
          key: signed.key,
          name: item.name.trim(),
          originalName: signed.name,
          description: item.description.trim(),
          type: signed.type,
          size: item.file.size,
          category: item.category,
          expiresAt: item.expiresAt,
          createdAt: serverTimestamp()
        });
        completed++;
        updateDraft(item.id, { status: 'saved', error: '' });
      } catch (failure) {
        rejected++;
        if (key) {
          try { await documentApi(user, '/api/documents?key=' + encodeURIComponent(key), { method: 'DELETE' }); }
          catch { /* Storage administrator may need to review an orphaned upload. */ }
        }
        updateDraft(item.id, { status: 'error', error: failure instanceof Error ? failure.message : 'Upload failed.' });
      }
      setProgress(old => ({ ...old, done: old.done + 1 }));
    }
    setBusy(false);
    if (completed) onNotice(completed + (completed === 1 ? ' document saved.' : ' documents saved.') + ' Your vault updates automatically.');
    if (rejected) setBatchError(rejected + (rejected === 1 ? ' document needs attention.' : ' documents need attention.') + ' Fix and retry them individually.');
    else { setUploadOpen(false); setDrafts([]); setBatchError(''); setProgress({ done: 0, total: 0 }); }
  };

  const openFile = async (file: VaultFile) => {
    const windowRef = window.open('about:blank', '_blank');
    if (windowRef) windowRef.opener = null;
    try {
      const signed = await documentApi<{ url: string }>(user, '/api/documents?key=' + encodeURIComponent(file.key));
      if (windowRef && !windowRef.closed) windowRef.location.replace(signed.url);
      else window.location.assign(signed.url);
    } catch {
      if (windowRef && !windowRef.closed) windowRef.close();
      onNotice('Unable to open this document. Check storage configuration.');
    }
  };
  const deleteFile = async (file: VaultFile) => {
    if (!db || deleting || !window.confirm('Permanently delete ' + file.name + '?')) return;
    setDeleting(true);
    try {
      await documentApi(user, '/api/documents?key=' + encodeURIComponent(file.key), { method: 'DELETE' });
      await deleteDoc(doc(db, 'contractors', user.uid, 'documents', file.id));
      setSelected(null);
      onNotice(file.name + ' deleted.');
    } catch { onNotice('Unable to delete this document. Try again.'); }
    finally { setDeleting(false); }
  };

  useEffect(() => {
    const isOpen = uploadOpen || Boolean(selected);
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { if (uploadOpen) closeUpload(); else setSelected(null); }
      if (event.key !== 'Tab' || !dialog.current) return;
      const focusables = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]')).filter(node => node.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = original; window.removeEventListener('keydown', onKey); };
  }, [uploadOpen, selected, busy]);

  return <>
    <div className="bo-page-heading">
      <div>
        <div className="bo-eyebrow"><LockKeyhole size={13}/> PRIVATE NONPROFIT STORAGE</div>
        <h1>Document vault<span className="bo-heading-dot">.</span></h1>
        <p>Organise your registration, governance, financial and programme documents in one private place.</p>
      </div>
      <button className="bo-primary" onClick={() => setUploadOpen(true)} disabled={loading || Boolean(error)}>
        <Plus size={18}/> Upload a document
      </button>
    </div>
    {error && <div className="bo-inline-error" role="alert">{error} <button onClick={() => window.location.reload()}>Retry connection</button></div>}
    <section className="bo-panel bo-document-table-panel">
      <div className="bo-table-top">
        <div><div className="bo-small-kicker">PRIVATE DOCUMENT LIBRARY</div><h3>Organisation documents</h3></div>
        <span className="bo-record-count">{loading ? 'Loading…' : files.length + (files.length === 1 ? ' document' : ' documents')}</span>
      </div>
      {loading ? <div className="bo-skeleton-wrap">{[1,2,3].map(i => <div className="bo-skeleton" key={i}/>)}</div> :
        error ? <div className="bo-doc-state">Your documents cannot be displayed until the connection is restored.</div> :
        files.length ? <div className="bo-doc-table-wrap"><table className="bo-doc-table">
          <thead><tr><th>DOCUMENT</th><th>CATEGORY</th><th>SIZE</th><th>ADDED</th><th aria-label="View details"></th></tr></thead>
          <tbody>{files.map(file => <tr key={file.id} onClick={() => setSelected(file)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setSelected(file); }}>
            <td><div className="bo-doc-name-cell"><span className="bo-doc-fileicon"><FileText size={19}/></span><span><strong>{file.name}</strong><small>{file.description || file.originalName || 'View document details'}</small></span></div></td>
            <td>{file.category || 'Other'}</td><td>{sizeText(file.size)}</td><td>{fileDate(file.createdAt)}</td>
            <td><ArrowRight size={17}/></td>
          </tr>)}</tbody>
        </table></div> :
        <div className="bo-doc-empty">
          <div className="bo-doc-empty-art"><FolderOpen size={31}/></div>
          <h3>Your document library is ready.</h3>
          <p>Start with your NPO registration, constitution, financial statements or organisation profile. Each file gets a name, optional description and its own secure record.</p>
          <button className="bo-primary" onClick={() => setUploadOpen(true)}><Plus size={17}/> Upload your first document</button>
        </div>}
    </section>

    {uploadOpen && <div className="bo-doc-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeUpload(); }}>
      <section ref={dialog} className="bo-doc-modal bo-doc-upload-modal" role="dialog" aria-modal="true" aria-labelledby="bo-upload-title" tabIndex={-1}>
        <div className="bo-doc-modal-top"><div><span className="bo-small-kicker">DOCUMENT VAULT</span><h2 id="bo-upload-title">Upload documents</h2><p>Add files, give each a name and include any helpful details.</p></div><button aria-label="Close upload dialog" className="bo-doc-icon-btn" disabled={busy} onClick={closeUpload}><X size={20}/></button></div>
        <form onSubmit={event => void uploadBatch(event)}>
          <div className="bo-doc-modal-scroll">
            <div className="bo-drop-area" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) queueFiles(event.dataTransfer.files); }}>
              <span className="bo-drop-icon"><UploadCloud size={24}/></span>
              <strong>Select files to upload</strong>
              <p>PDF, Word, Excel or images · 15 MB per document · up to 12 at a time</p>
              <button className="bo-outline" type="button" onClick={() => picker.current?.click()} disabled={busy}><Plus size={15}/> Browse files</button>
              <input ref={picker} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx" multiple onChange={event => queueFiles(event.currentTarget.files || [])} className="bo-hidden-input" tabIndex={-1}/>
            </div>
            {drafts.length > 0 && <div className="bo-doc-upload-queue">
              <div className="bo-doc-queue-title"><strong>{drafts.length} {drafts.length === 1 ? 'document' : 'documents'} selected</strong><span>Individual document details</span></div>
              {drafts.map((item, index) => <div className="bo-doc-queue-item" key={item.id}>
                <div className="bo-doc-queue-head"><span className="bo-doc-fileicon"><FileText size={19}/></span><span><strong>Document {index + 1}</strong><small title={item.file.name}>{item.file.name} · {sizeText(item.file.size)}</small></span><span className={'bo-doc-item-status bo-doc-status-' + item.status}>{item.status === 'saved' ? <><Check size={14}/> Saved</> : item.status === 'uploading' ? 'Uploading…' : item.status === 'error' ? 'Needs attention' : 'Ready'}</span>{!busy && <button type="button" title="Remove file" aria-label={'Remove ' + item.file.name} onClick={() => setDrafts(current => current.filter(d => d.id !== item.id))}><X size={17}/></button>}</div>
                {item.status !== 'saved' && <div className="bo-doc-upload-fields">
                  <label>Document name <span>*</span><input required maxLength={110} value={item.name} disabled={busy} onChange={event => updateDraft(item.id, { name: event.target.value })} placeholder="e.g. Tax clearance certificate"/></label>
                  <label>Description <span className="bo-optional">(optional)</span><textarea maxLength={1000} rows={2} disabled={busy} value={item.description} onChange={event => updateDraft(item.id, { description: event.target.value })} placeholder="A note to help you identify this document later"/></label>
                  <div className="bo-doc-two-fields"><label>Category <select value={item.category} disabled={busy} onChange={event => updateDraft(item.id, { category: event.target.value })}>{categories.map(category => <option key={category}>{category}</option>)}</select></label><label>Expiry <span className="bo-optional">(optional)</span><input type="date" value={item.expiresAt} disabled={busy} onChange={event => updateDraft(item.id, { expiresAt: event.target.value })}/></label></div>
                </div>}
                {item.error && <p className="bo-doc-item-error" role="alert">{item.error}</p>}
              </div>)}
            </div>}
            {batchError && <p role="alert" className="bo-doc-batch-error">{batchError}</p>}
          </div>
          <div className="bo-doc-modal-actions"><span>{busy ? 'Uploading ' + progress.done + ' of ' + progress.total + ' completed' : 'Private nonprofit storage'}</span><button type="button" className="bo-outline" onClick={closeUpload} disabled={busy}>Cancel</button><button type="submit" className="bo-primary" disabled={busy || !drafts.some(d => d.status !== 'saved') || Boolean(error)}><CloudUpload size={17}/>{busy ? 'Uploading…' : 'Save ' + drafts.filter(d => d.status !== 'saved').length + (drafts.filter(d => d.status !== 'saved').length === 1 ? ' document' : ' documents')}</button></div>
        </form>
      </section>
    </div>}

    {selected && <div className="bo-doc-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section ref={dialog} className="bo-doc-modal bo-doc-details-modal" role="dialog" aria-modal="true" aria-labelledby="bo-doc-detail-title" tabIndex={-1}>
        <div className="bo-doc-modal-top"><div><span className="bo-small-kicker">DOCUMENT DETAILS</span><h2 id="bo-doc-detail-title">{selected.name}</h2><p>Private record saved in your company workspace.</p></div><button className="bo-doc-icon-btn" aria-label="Close details" onClick={() => setSelected(null)}><X size={20}/></button></div>
        <div className="bo-doc-modal-scroll">
          <div className="bo-doc-detail-cover"><div className="bo-doc-fileicon"><FileText size={27}/></div><div><strong>{selected.name}</strong><small>{selected.originalName || selected.name}</small></div></div>
          <div className="bo-doc-detail-grid">
            <div><span>CATEGORY</span><strong>{selected.category || 'Other'}</strong></div>
            <div><span>FILE SIZE</span><strong>{sizeText(selected.size)}</strong></div>
            <div><span>DATE ADDED</span><strong>{fileDate(selected.createdAt)}</strong></div>
            <div><span>EXPIRY DATE</span><strong>{selected.expiresAt ? dateText(selected.expiresAt) : 'None set'}</strong></div>
          </div>
          <div className="bo-doc-description"><span>DESCRIPTION</span><p>{selected.description || 'No description added.'}</p></div>
          <div className="bo-doc-private-note"><LockKeyhole size={16}/> Only your authorised account can access this file. Download links expire automatically.</div>
        </div>
        <div className="bo-doc-modal-actions"><button className="bo-doc-danger" disabled={deleting} onClick={() => void deleteFile(selected)}><Trash2 size={16}/>{deleting ? 'Deleting…' : 'Delete'}</button><button className="bo-primary" onClick={() => void openFile(selected)}><ArrowDownToLine size={17}/> Open document</button></div>
      </section>
    </div>}
  </>;
}
