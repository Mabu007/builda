import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDocs, limitToLast, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, writeBatch
} from 'firebase/firestore';
import { ArrowRight, Bot, Check, ChevronDown, Clock3, FileText, Menu, MessageSquareText,
  MoreHorizontal, Plus, SendHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { db } from '../firebase';
import './assistant.css';

type Tender = { id: string; title: string; description?: string; buyer?: string; province?: string; category?: string;
  reference?: string; closesAt?: string; eligibility?: string; specialConditions?: string; submission?: string;
  briefing?: { date: string; venue: string; compulsory: boolean } | null };
type Chat = { id: string; title: string; updatedAt?: { seconds: number }; sourceTender?: Tender | null };
type Message = { id: string; role: 'assistant' | 'user'; content: string; createdAt?: { seconds: number } };
type Organisation = Record<string, string>;
type DocumentMeta = { name: string; category?: string; description?: string; expiresAt?: string };
type Props = { user: User; organisation: Organisation; documents: DocumentMeta[]; model: string;
  selectedTender?: Tender | null; onClearTender?: () => void; onViewProfile?: () => void };
const suggested = [
  { title: 'Break down an opportunity', text: 'Help me understand a tender or funding call, its requirements, deadlines and next steps.' },
  { title: 'Check my application readiness', text: 'Based on my organisation profile and document list, what information is missing for common applications?' },
  { title: 'Explain eligibility language', text: 'Explain the common eligibility requirements in South African tenders and CSI funding calls, in plain language.' },
  { title: 'Prepare an application checklist', text: 'Create a practical application preparation checklist for my organisation, identifying what still needs verification.' },
];
const viewTime = (s?: number) => s ? new Date(s * 1000).toLocaleDateString('en-ZA', { month:'short',day:'numeric' }) : 'New';
const inlineFormatting = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((segment, index) =>
  segment.startsWith('**') && segment.endsWith('**') ? <strong key={index}>{segment.slice(2,-2)}</strong> : <React.Fragment key={index}>{segment}</React.Fragment>);
function renderAssistantText(text: string) {
  return text.split(/\n/).map((line, i) => {
    const clean = line.trim();
    if (!clean) return <div className="op-chat-line-space" key={i}/>;
    const title = /^(#{1,3}\s+)(.*)/.exec(clean);
    if (title) return <div className="op-chat-line-heading" key={i}>{inlineFormatting(title[2])}</div>;
    const bullet = /^(?:[-•*]\s+|\d+[.)]\s+)(.*)/.exec(clean);
    if (bullet) return <div className="op-chat-line-bullet" key={i}><span>•</span><span>{inlineFormatting(bullet[1])}</span></div>;
    return <div className="op-chat-line-text" key={i}>{inlineFormatting(clean)}</div>;
  });
}

async function assistantApi(user: User, payload: unknown) {
  const token = await user.getIdToken();
  const response = await fetch('/api/assistant', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(result.error || 'The assistant could not respond. Please retry.'));
  if (typeof result.answer !== 'string' || !result.answer.trim()) throw new Error('The AI returned an empty response.');
  return result as { answer: string; model: string; fallback?: boolean };
}
export default function AssistantHub({ user, organisation, documents, model, selectedTender, onClearTender, onViewProfile }: Props) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [activeTender, setActiveTender] = useState<Tender | null>(selectedTender || null);
  const [mobileList, setMobileList] = useState(false);
  const [retry, setRetry] = useState('');
  const [responseModel, setResponseModel] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  const pending = useRef('');

  useEffect(() => {
    if (!selectedTender) return;
    setActiveTender(selectedTender); setChatId(null); setMessages([]);
    setDraft('Explain the requirements and possible fit for this opportunity, and tell me what to check before applying.');
    setRetry(''); setError('');
  }, [selectedTender?.id]);

  useEffect(() => {
    if (!db) { setStorageError('Firestore is not configured. Chat history cannot be saved.'); return; }
    const path = collection(db, 'contractors', user.uid, 'chats');
    return onSnapshot(query(path, orderBy('updatedAt','desc')), snapshot => {
      const loaded = snapshot.docs.slice(0, 60).map(item => ({ ...item.data(), id: item.id } as Chat));
      setChats(loaded); setStorageError('');
    }, () => setStorageError('Chat history could not load. Please publish the latest Firestore rules.'));
  }, [user.uid]);

  useEffect(() => {
    if (!db || !chatId) { setMessages([]); return; }
    return onSnapshot(query(collection(db, 'contractors', user.uid, 'chats', chatId, 'messages'), orderBy('createdAt','asc'), limitToLast(80)), snapshot => {
      setMessages(snapshot.docs.map(item => ({ ...item.data(), id: item.id } as Message)));
      setStorageError('');
    }, () => setStorageError('Messages cannot load. Check Firestore permissions.'));
  }, [user.uid, chatId]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, busy, error]);
  const currentChat = chats.find(chat => chat.id === chatId);
  const currentTender = activeTender || currentChat?.sourceTender || null;
  const canChat = Boolean(db) && !storageError;
  const startNew = () => {
    setChatId(null); setMessages([]); setDraft(''); setActiveTender(null);
    setRetry(''); setError(''); setResponseModel(''); setMobileList(false);
    onClearTender?.();
    textarea.current?.focus();
  };
  const openChat = (chat: Chat) => {
    setChatId(chat.id); setActiveTender(chat.sourceTender || null);
    setDraft(''); setRetry(''); setError(''); setMobileList(false); setResponseModel('');
    onClearTender?.();
  };
  const removeChat = async (chat: Chat) => {
    if (!db || busy || !window.confirm('Delete this conversation and its messages?')) return;
    try {
      const path = collection(db, 'contractors', user.uid, 'chats', chat.id, 'messages');
      const entries = await getDocs(path);
      for (let i = 0; i < entries.docs.length; i += 300) {
        const batch = writeBatch(db);
        for (const entry of entries.docs.slice(i, i + 300)) batch.delete(entry.ref);
        await batch.commit();
      }
      await deleteDoc(doc(db, 'contractors', user.uid, 'chats', chat.id));
      if (chatId === chat.id) startNew();
    } catch { setStorageError('Unable to delete this conversation. Retry when the connection is restored.'); }
  };
  const send = async (value?: string, isRetry = false) => {
    const question = (value ?? draft).trim();
    if (!question || busy || sending.current || question.length > 3500 || !db) return;
    sending.current = true; setBusy(true); setError(''); setRetry(''); setResponseModel('');
    if (!isRetry) setDraft('');
    let id = chatId;
    const tender = currentTender;
    const originalMessages = messages.map(item => ({ role: item.role, content: item.content }));
    try {
      if (!id) {
        const reference = doc(collection(db, 'contractors', user.uid, 'chats'));
        id = reference.id;
        const title = tender?.title || question;
        await setDoc(reference, {
          ownerId: user.uid, title: title.slice(0, 105),
          sourceTender: tender || null, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        setChatId(id);
      }
      if (!isRetry) {
        await setDoc(doc(collection(db, 'contractors', user.uid, 'chats', id, 'messages')), {
          role: 'user', content: question, createdAt: serverTimestamp()
        });
      }
      const history = isRetry && originalMessages[originalMessages.length - 1]?.role === 'user'
        ? originalMessages : [...originalMessages, { role: 'user', content: question }];
      const result = await assistantApi(user, {
        model, company: organisation, documents, tender,
        messages: history.slice(-12)
      });
      await setDoc(doc(collection(db, 'contractors', user.uid, 'chats', id, 'messages')), {
        role: 'assistant', content: result.answer, createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'contractors', user.uid, 'chats', id), { updatedAt: serverTimestamp() });
      setResponseModel(result.fallback ? 'Replied using a fallback model' : 'Response ready');
      setRetry('');
    } catch (failure) {
      setRetry(question);
      setError(failure instanceof Error ? failure.message : 'The response failed. Try again.');
      if (!id) setDraft(question);
    } finally { sending.current = false; setBusy(false); }
  };
  const suggestions = useMemo(() => suggested.filter(item => organisation.organizationType !== 'npo' || !item.title.includes('tender')), [organisation.organizationType]);
  return <div className="op-chat-shell">
    <aside className={'op-chat-list ' + (mobileList ? 'op-chat-list-open' : '')}>
      <div className="op-chat-list-top"><div><span className="op-chat-kicker">YOUR ADMIN DESK</span><h2>Conversations</h2></div><button title="New conversation" onClick={startNew}><Plus size={19}/></button></div>
      <button className="op-chat-new" onClick={startNew}><Plus size={17}/> New conversation</button>
      <div className="op-chat-section-label">RECENT CONVERSATIONS</div>
      <div className="op-chat-history">
        {chats.length === 0 && <div className="op-chat-list-empty"><MessageSquareText size={23}/><p>Start a conversation with your opportunity assistant.</p></div>}
        {chats.map(chat => <div className={'op-chat-history-item ' + (chat.id === chatId ? 'active' : '')} key={chat.id}>
          <button className="op-chat-history-main" title={chat.title} onClick={() => openChat(chat)}><MessageSquareText size={17}/><span><strong>{chat.title || 'New conversation'}</strong><small>{viewTime(chat.updatedAt?.seconds)}</small></span></button>
          <button className="op-chat-trash" title="Delete chat" aria-label={'Delete ' + chat.title} onClick={() => void removeChat(chat)}><Trash2 size={15}/></button>
        </div>)}
      </div>
      <div className="op-chat-private"><Sparkles size={15}/> Each organisation has its own private conversations.</div>
    </aside>
    <div className="op-chat-main">
      <div className="op-chat-header">
        <div className="op-chat-head-left"><button className="op-chat-mobile-toggle" aria-label="Show conversations" onClick={() => setMobileList(!mobileList)}><Menu size={20}/></button>
          <span className="op-chat-bot-icon"><Bot size={19}/></span><span><strong>OPPOTRON Assistant</strong><small>Opportunity research & administration</small></span>
        </div>
        <button className="op-chat-head-new" onClick={startNew}><Plus size={15}/> New chat</button>
      </div>
      {storageError && <div className="op-chat-error" role="alert">{storageError}</div>}
      <div className="op-chat-messages">
        {!chatId && !messages.length && <div className="op-chat-welcome">
          <div className="op-chat-welcome-icon"><Sparkles size={27}/></div>
          <div className="op-chat-kicker">YOUR AI ADMIN ASSISTANT</div>
          <h2>What can I take off your desk?</h2>
          <p>Ask me to decode a tender, explain a CSI funding call, identify application gaps or prepare your next steps. I use your organisation profile as context.</p>
          {currentTender && <div className="op-chat-tender-context"><FileText size={17}/><span><strong>Discussing a selected opportunity</strong><small>{currentTender.title}</small></span><button title="Remove selected opportunity" onClick={() => { setActiveTender(null);onClearTender?.(); }}><X size={15}/></button></div>}
          <div className="op-chat-suggestions">{suggestions.map((item,i)=><button key={i} onClick={() => void send(item.text)} disabled={!canChat || busy}><span><strong>{item.title}</strong><small>{item.text}</small></span><ArrowRight size={17}/></button>)}</div>
          {!organisation.name && <button className="op-chat-profile-link" onClick={onViewProfile}>Complete your organisation profile for more tailored guidance <ArrowRight size={14}/></button>}
        </div>}
        {messages.map(message => <div className={'op-chat-message op-chat-message-' + message.role} key={message.id}>
          <span className="op-chat-message-icon">{message.role === 'assistant' ? <Sparkles size={16}/> : <span>{organisation.name?.charAt(0).toUpperCase() || 'Y'}</span>}</span>
          <div className="op-chat-message-content"><div className="op-chat-message-label">{message.role === 'assistant' ? 'OPPOTRON' : 'You'}</div><div className="op-chat-message-text">{message.role === 'assistant' ? renderAssistantText(message.content) : message.content}</div></div>
        </div>)}
        {busy && <div className="op-chat-message op-chat-message-assistant"><span className="op-chat-message-icon"><Sparkles size={16}/></span><div className="op-chat-message-content"><div className="op-chat-message-label">OPPOTRON</div><div className="op-chat-thinking"><span/><span/><span/> Thinking through your question…</div></div></div>}
        {error && <div className="op-chat-error" role="alert"><span>{error}</span>{retry && <button onClick={() => void send(retry, true)}>Retry response <ArrowRight size={15}/></button>}</div>}
        <div ref={bottom}/>
      </div>
      <div className="op-chat-composer-wrap">
        {currentTender && chatId && <div className="op-chat-context-line"><FileText size={15}/> Context: {currentTender.title}</div>}
        <form className="op-chat-composer" onSubmit={e => { e.preventDefault(); void send(); }}>
          <textarea ref={textarea} value={draft} maxLength={3500} rows={2} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {e.preventDefault();void send();} }}
            placeholder="Ask OPPOTRON about tenders, funding, applications…" disabled={busy || !canChat} aria-label="Message OPPOTRON"/>
          <button className="op-chat-send" type="submit" title="Send message" aria-label="Send message" disabled={busy || !draft.trim() || !canChat}><SendHorizontal size={18}/></button>
        </form>
        <div className="op-chat-disclaimer"><span>{responseModel || 'Your organisation’s opportunity desk'}</span><span>Verify published requirements before applying.</span></div>
      </div>
    </div>
  </div>;
}
