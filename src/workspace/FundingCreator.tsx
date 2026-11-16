import React,{useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {collection,deleteDoc,doc,onSnapshot,serverTimestamp,setDoc} from 'firebase/firestore';
import {ArrowDownToLine,Bot,Check,FilePenLine,FileText,Plus,Printer,Save,Sparkles,Trash2} from 'lucide-react';
import {db} from '../firebase';
import type {FundingOpportunity} from './funding';
import './funding-ui.css';
type Draft={id:string;title:string;content:string;opportunityId:string;createdAt?:{seconds:number};updatedAt?:{seconds:number}};
type Props={user:User;profile:Record<string,string>;files:{name:string;category:string;description?:string}[];model:string;opportunity:FundingOpportunity|null};
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
export default function FundingCreator({user,profile,files,model,opportunity}:Props){
 const [drafts,setDrafts]=useState<Draft[]>([]),[id,setId]=useState(''),[title,setTitle]=useState('Untitled funding document'),[content,setContent]=useState(''),[prompt,setPrompt]=useState(''),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [opportunityId,setOpportunityId]=useState('');
 const editor=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{
  if(!db)return;
  return onSnapshot(collection(db,'contractors',user.uid,'fundingDrafts'),snap=>setDrafts(snap.docs.map(x=>({...x.data(),id:x.id} as Draft)).sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0))),()=>setError('Could not load your private drafts. Check Firebase rules.'));
 },[user.uid]);
 useEffect(()=>{
  if(!opportunity)return;
  setOpportunityId(opportunity.id);
  setTitle('Funding proposal — '+opportunity.funder);
  setPrompt('Write a professional, editable funding proposal first draft for our nonprofit responding to '+opportunity.title+' by '+opportunity.funder+'. Use only our saved organisation profile and the following published eligibility and requirements: '+[opportunity.eligibility,...(opportunity.requirements||[])].join('; ').slice(0,900)+'. Never invent a financial figure, grant history, beneficiary statistic or programme outcome. Mark all missing information [TO VERIFY].');
 },[opportunity?.id]);
 const createNew=()=>{setId('');setTitle('Untitled funding document');setContent('');setPrompt('');setOpportunityId('');setError('');setNotice('');};
 const select=(draft:Draft)=>{setId(draft.id);setTitle(draft.title);setContent(draft.content);setOpportunityId(draft.opportunityId||'');setNotice('');setError('');};
 const generate=async()=>{
  if(!prompt.trim()||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const token=await user.getIdToken();
   const response=await fetch('/api/assistant',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({model,company:{...profile,organizationType:'npo'},documents:files,
     messages:[{role:'user',content:'You are preparing a first-draft fundraising document for my review. '+prompt.slice(0,2800)+' Return a structured draft with a clear title, overview, problem statement, approach, expected outputs, implementation, sustainability, monitoring and budget placeholders only where relevant. Do not claim any figures or outcomes that are not in our organisation profile.'}]})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'AI request failed.');
   if(!result.answer)throw new Error('AI returned an empty draft.');
   setContent(result.answer);setNotice('Draft created. Review all facts and edit before using or exporting.');editor.current?.focus();
  }catch(e){setError(e instanceof Error?e.message:'Unable to generate draft.');}
  finally{setBusy(false);}
 };
 const save=async()=>{
  if(!db||!title.trim()||!content.trim()||saving)return;
  setSaving(true);setError('');setNotice('');
  try{
   const reference=id?doc(db,'contractors',user.uid,'fundingDrafts',id):doc(collection(db,'contractors',user.uid,'fundingDrafts'));
   await setDoc(reference,{title:title.trim().slice(0,180),content:content.slice(0,60000),opportunityId:opportunityId||'',
    updatedAt:serverTimestamp(),...(!id?{createdAt:serverTimestamp()}:{})},{merge:true});
   setId(reference.id);setNotice('Document saved privately.');
  }catch{setError('Could not save the document. Check Firestore rules.');}
  finally{setSaving(false);}
 };
 const remove=async()=>{if(!id||!db||!window.confirm('Delete this saved draft?'))return;try{await deleteDoc(doc(db,'contractors',user.uid,'fundingDrafts',id));createNew();}catch{setError('Unable to delete the draft.');}};
 const downloadWord=()=>{
  const html='<html><head><meta charset="utf-8"></head><body><h1>'+escapeHtml(title)+'</h1>'+content.split('\n').map(line=>'<p>'+escapeHtml(line)+'</p>').join('')+'</body></html>';
  const file=new Blob(['\ufeff',html],{type:'application/msword'}),url=URL.createObjectURL(file);
  const a=document.createElement('a');a.href=url;a.download=(title.replace(/[^a-z0-9 _-]/gi,'').slice(0,75)||'proposal')+'.doc';a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const printPdf=()=>{
  const win=window.open('','_blank');if(!win){setError('Allow popups to print or save a PDF.');return;}
  win.document.write('<!doctype html><html><head><title>'+escapeHtml(title)+'</title><style>body{font:13px/1.7 Arial,sans-serif;max-width:760px;margin:55px auto;color:#222}h1{font-size:24px}p{white-space:pre-wrap}</style></head><body><h1>'+escapeHtml(title)+'</h1>'+content.split('\n').map(line=>'<p>'+escapeHtml(line)+'</p>').join('')+'</body></html>');
  win.document.close();win.focus();win.setTimeout(()=>win.print(),300);
 };
 return <>
  <div className="bo-page-heading"><div><div className="bo-eyebrow"><FilePenLine size={14}/> FUNDRAISING WRITING WORKSPACE</div><h1>Document Creator<span className="bo-heading-dot">.</span></h1><p>Create editable funding drafts with your NPO context, save them privately and export them for review.</p></div></div>
  {error&&<div role="alert" className="bo-inline-error">{error}</div>}{notice&&<div role="status" className="fu-success"><Check size={16}/>{notice}</div>}
  <div className="fu-creator-layout"><aside className="fu-draft-list"><div className="fu-draft-head"><strong>Your documents</strong><button aria-label="New document" onClick={createNew}><Plus size={19}/></button></div>
   <button className="fu-new-draft" onClick={createNew}><Plus size={17}/> New document</button>
   {drafts.length?drafts.map(d=><button key={d.id} onClick={()=>select(d)} className={'fu-draft-item '+(d.id===id?'active':'')}><FileText size={17}/><span><strong>{d.title}</strong><small>{d.updatedAt?.seconds?new Date(d.updatedAt.seconds*1000).toLocaleDateString('en-ZA'):'Saved draft'}</small></span></button>):<p className="fu-draft-empty">Your saved funding documents will appear here.</p>}
  </aside><section className="fu-editor"><div className="fu-editor-toolbar"><span><FilePenLine size={17}/> EDITABLE FUNDING DOCUMENT</span><div><button onClick={()=>void save()} disabled={!content.trim()||saving}><Save size={16}/>{saving?'Saving…':'Save'}</button><button onClick={downloadWord} disabled={!content.trim()}><ArrowDownToLine size={16}/> Word</button><button onClick={printPdf} disabled={!content.trim()}><Printer size={16}/> Print / PDF</button>{id&&<button className="fu-delete" onClick={()=>void remove()}><Trash2 size={16}/></button>}</div></div>
    <div className="fu-ai-request"><span><Sparkles size={18}/><strong>Ask OPPOTRON to write</strong></span><textarea aria-label="Document drafting instructions" value={prompt} onChange={e=>setPrompt(e.target.value)} rows={2} placeholder="Write a funding proposal for our youth development programme…"/>
     <button className="bo-primary" disabled={!prompt.trim()||busy} onClick={()=>void generate()}><Bot size={16}/>{busy?'Drafting…':'Generate draft'}</button>
     <small>The AI uses your saved organisation profile and document metadata, not uploaded file contents. Review all figures, dates and claims.</small></div>
    <div className="fu-paper"><input aria-label="Document title" className="fu-paper-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={180}/>
      <textarea ref={editor} aria-label="Editable document" className="fu-paper-body" value={content} onChange={e=>setContent(e.target.value)} placeholder="Start writing here, or ask OPPOTRON to prepare a first draft…"/>
    </div>
  </section></div>
 </>;
}
