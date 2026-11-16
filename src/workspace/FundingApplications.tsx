import React,{useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {collection,deleteDoc,doc,onSnapshot,query,serverTimestamp,updateDoc,where} from 'firebase/firestore';
import {ArrowUpRight,Check,ClipboardCheck,FileText,HeartHandshake,LockKeyhole,Mail,Phone,Save,Trash2} from 'lucide-react';
import {db} from '../firebase';
import type {FundingOpportunity} from './funding';
import './funding-ui.css';
type Application={opportunityId:string;status:'preparing'|'ready'|'submitted'|'awarded'|'unsuccessful';notes:string;deadline:string;requirements:string[];updatedAt?:{seconds:number}};
type Props={user:User;onOpportunities:()=>void;onPrepare:(op:FundingOpportunity)=>void};
const statuses=['preparing','ready','submitted','awarded','unsuccessful'] as const;
export default function FundingApplications({user,onOpportunities,onPrepare}:Props){
 const [applications,setApplications]=useState<Application[]>([]),[opportunities,setOpportunities]=useState<FundingOpportunity[]>([]);
 const [selected,setSelected]=useState(''),[draft,setDraft]=useState<Application|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  if(!db)return;
  const one=onSnapshot(collection(db,'contractors',user.uid,'applications'),snap=>setApplications(snap.docs.map(x=>x.data() as Application)),()=>setError('Unable to load your private applications. Check Firestore security rules.'));
  const two=onSnapshot(query(collection(db,'opportunities'),where('published','==',true)),snap=>setOpportunities(snap.docs.map(x=>({...x.data(),id:x.id} as FundingOpportunity))),()=>setError('Funding opportunity records could not be loaded.'));
  return()=>{one();two();};
 },[user.uid]);
 const open=(app:Application)=>{setDraft({...app,requirements:[...(app.requirements||[])]});setSelected(app.opportunityId);setError('');};
 const save=async()=>{
  if(!db||!draft||busy)return;
  setBusy(true);setError('');
  try{
   await updateDoc(doc(db,'contractors',user.uid,'applications',draft.opportunityId),{
    status:draft.status,notes:draft.notes.slice(0,4000),requirements:draft.requirements||[],updatedAt:serverTimestamp()
   });
   setSelected('');setDraft(null);
  }catch{setError('Unable to save application progress. Check permissions.');}
  finally{setBusy(false);}
 };
 const remove=async(app:Application)=>{
  if(!db||!confirm('Remove this application tracking record? Your documents will not be deleted.'))return;
  try{await deleteDoc(doc(db,'contractors',user.uid,'applications',app.opportunityId));setSelected('');setDraft(null);}
  catch{setError('Unable to remove application record.');}
 };
 const selectedOp=opportunities.find(x=>x.id===selected);
 return <><div className="bo-page-heading"><div><div className="bo-eyebrow"><ClipboardCheck size={14}/> YOUR FUNDING APPLICATIONS</div><h1>Applications<span className="bo-heading-dot">.</span></h1><p>Prepare, track and update your grant applications. Submission is always done by you through the official funding channel.</p></div></div>
 {error&&<div role="alert" className="bo-inline-error">{error}</div>}
 {applications.length===0?<section className="fu-empty"><span className="fu-empty-symbol"><ClipboardCheck size={29}/></span><h2>No applications being tracked.</h2><p>When you find a relevant published funding opportunity, choose “Track application” and manage its progress here.</p><button className="bo-primary" onClick={onOpportunities}>Explore funding opportunities <ArrowUpRight size={16}/></button></section>:
 <div className="fu-application-layout"><div className="fu-application-list">{applications.map(app=>{
  const op=opportunities.find(o=>o.id===app.opportunityId);
  return <button className={'fu-application-list-item '+(selected===app.opportunityId?'active':'')} key={app.opportunityId} onClick={()=>open(app)}>
   <span className="fu-app-status">{app.status}</span><strong>{op?.title||'Previously saved funding call'}</strong><small>{op?.funder||'Source no longer publicly listed'} · {app.deadline||'Deadline not specified'}</small>
  </button>;
 })}</div><div className="fu-application-detail">{!draft?<div className="fu-application-prompt"><ClipboardCheck size={28}/><h3>Choose an application</h3><p>Review its details, track your progress and keep notes in your private account.</p></div>:
 <><div className="fu-application-detail-header"><span className="bo-small-kicker">YOUR PRIVATE APPLICATION RECORD</span><h2>{selectedOp?.title||'Application record'}</h2><p>{selectedOp?.funder||'Source unavailable'}</p></div>
 <div className="fu-application-edit">
  {selectedOp?.applicationInstructions&&<div className="fu-application-guidance"><strong>How to apply</strong><p>{selectedOp.applicationInstructions}</p></div>}
  {(selectedOp?.contactEmail||selectedOp?.contactPhone)&&<div className="fu-contact-links">
   {selectedOp?.contactEmail&&<a href={'mailto:'+selectedOp.contactEmail}><Mail size={15}/>{selectedOp.contactEmail}</a>}
   {selectedOp?.contactPhone&&<a href={'tel:'+selectedOp.contactPhone.replace(/[^\d+]/g,'')}><Phone size={15}/>{selectedOp.contactPhone}</a>}
  </div>}
  <label>Application status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as Application['status']})}>{statuses.map(status=><option key={status} value={status}>{status[0].toUpperCase()+status.slice(1)}</option>)}</select></label>
  {draft.status==='submitted'&&<p className="fu-application-disclaimer"><LockKeyhole size={14}/> “Submitted” means you confirmed submission externally. OPPOTRON has not submitted anything for you.</p>}
  <label>Application notes<textarea rows={6} maxLength={4000} value={draft.notes||''} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="Application reference, contacts, next steps, queries and outcomes…"/></label>
  {(selectedOp?.requirements||[]).length>0&&<div className="fu-application-checklist"><strong>Funder requirements to prepare</strong>{selectedOp!.requirements.map((req,i)=><label key={i}><input type="checkbox" checked={draft.requirements?.includes(req)||false} onChange={e=>setDraft({...draft,requirements:e.target.checked?[...(draft.requirements||[]),req]:(draft.requirements||[]).filter(x=>x!==req)})}/><span>{req}</span></label>)}</div>}
  <div className="fu-application-tools"><button className="bo-primary" disabled={busy} onClick={()=>void save()}><Save size={16}/>{busy?'Saving…':'Save progress'}</button>
   {selectedOp&&<button className="bo-outline" onClick={()=>onPrepare(selectedOp)}><FileText size={16}/> Prepare document</button>}
   {selectedOp?.applicationUrl?<a className="bo-outline" href={selectedOp.applicationUrl} target="_blank" rel="noopener noreferrer">Application website <ArrowUpRight size={16}/></a>:selectedOp?.sourceUrl?<a className="bo-outline" href={selectedOp.sourceUrl} target="_blank" rel="noopener noreferrer">View source website <ArrowUpRight size={16}/></a>:null}
   <button className="fu-delete" onClick={()=>void remove(draft)}><Trash2 size={16}/> Remove</button></div>
 </div></>}</div></div>}</>;
}
