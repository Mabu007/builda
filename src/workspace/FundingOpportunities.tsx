import React, {useEffect,useMemo,useState} from 'react';
import type {User} from 'firebase/auth';
import {collection,deleteDoc,doc,onSnapshot,query,serverTimestamp,setDoc,where} from 'firebase/firestore';
import {ArrowRight,ArrowUpRight,Bookmark,CalendarDays,CheckCircle2,ClipboardCheck,FilePenLine,FileText,FolderOpen,HeartHandshake,LockKeyhole,Search,Sparkles,X} from 'lucide-react';
import {db} from '../firebase';
import {matchOpportunity,opportunityExpired,type FundingOpportunity} from './funding';
import './funding-ui.css';
type Props={user:User;profile:Record<string,string>;files:{name:string;category:string}[];onPrepare:(op:FundingOpportunity)=>void;onApplications:()=>void};
const displayDate=(x?:string)=>x?new Date(x+'T12:00:00Z').toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'}):'Not specified';
export default function FundingOpportunities({user,profile,files,onPrepare,onApplications}:Props){
 const [all,setAll]=useState<FundingOpportunity[]>([]),[saved,setSaved]=useState<string[]>([]),[applications,setApplications]=useState<string[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState<FundingOpportunity|null>(null);
 const [search,setSearch]=useState(''),[sector,setSector]=useState(''),[working,setWorking]=useState('');
 useEffect(()=>{
  if(!db){setError('Firestore is not configured.');setLoading(false);return;}
  const u=onSnapshot(query(collection(db,'opportunities'),where('published','==',true)),snap=>{
   setAll(snap.docs.map(entry=>({...entry.data(),id:entry.id} as FundingOpportunity)));setLoading(false);setError('');
  },()=>{setError('Funding opportunities cannot be loaded. Check Firestore rules and retry.');setLoading(false);});
  const s=onSnapshot(collection(db,'contractors',user.uid,'savedFunding'),snap=>setSaved(snap.docs.map(item=>item.id)),()=>setError('Saved opportunities could not be loaded.'));
  const a=onSnapshot(collection(db,'contractors',user.uid,'applications'),snap=>setApplications(snap.docs.map(item=>item.id)),()=>setError('Applications could not be loaded.'));
  return()=>{u();s();a();};
 },[user.uid]);
 const sectors=useMemo(()=>[...new Set(all.map(o=>o.sector).filter(Boolean))].sort(),[all]);
 const matched=useMemo(()=>all.filter(o=>o.status==='published'&&!opportunityExpired(o)).map(op=>({op,match:matchOpportunity(op,profile,files)}))
    .filter(row=>row.match.eligible).sort((a,b)=>b.match.score-a.match.score),[all,profile,files]);
 const visible=matched.filter(row=>(!sector||row.op.sector===sector)&&(!search||[row.op.title,row.op.funder,row.op.sector,row.op.description].join(' ').toLowerCase().includes(search.toLowerCase())));
 const save=async(op:FundingOpportunity)=>{
  if(!db||working)return;setWorking(op.id);
  try{
   const ref=doc(db,'contractors',user.uid,'savedFunding',op.id);
   if(saved.includes(op.id))await deleteDoc(ref);
   else await setDoc(ref,{opportunityId:op.id,savedAt:serverTimestamp(),notes:''});
  }catch{setError('Unable to save this opportunity. Check Firestore permissions.');}finally{setWorking('');}
 };
 const start=async(op:FundingOpportunity)=>{
  if(!db||working)return;setWorking(op.id);
  try{
   await setDoc(doc(db,'contractors',user.uid,'applications',op.id),{
    opportunityId:op.id,status:'preparing',notes:'',deadline:op.deadline||'',requirements:[],
    createdAt:serverTimestamp(),updatedAt:serverTimestamp()
   },{merge:true});
   setSelected(null);onApplications();
  }catch{setError('Could not start this application. Check Firestore rules.');}finally{setWorking('');}
 };
 const openStored=async(op:FundingOpportunity,key:string)=>{
  const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;
  try{
   const token=await user.getIdToken();
   const response=await fetch('/api/funding-document?id='+encodeURIComponent(op.id)+'&key='+encodeURIComponent(key),{headers:{Authorization:'Bearer '+token}});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Document unavailable');
   if(tab)tab.location.replace(data.url);else window.location.assign(data.url);
  }catch{tab?.close();setError('Could not open this funding document.');}
 };
 const match=selected?matchOpportunity(selected,profile,files):null;
 return <>
  <div className="bo-page-heading"><div><div className="bo-eyebrow"><HeartHandshake size={14}/> FUNDING INTELLIGENCE</div><h1>Funding opportunities<span className="bo-heading-dot">.</span></h1><p>Verified public calls matched to your nonprofit’s mission and location, not a generic directory.</p></div></div>
  {error&&<div className="bo-inline-error" role="alert">{error}<button onClick={()=>window.location.reload()}>Retry</button></div>}
  {!profile.name||!profile.category&&!profile.services&&!profile.description?<section className="fu-empty">
   <span className="fu-empty-symbol"><Sparkles size={28}/></span><h2>We need to know your organisation first.</h2>
   <p>Complete your mission, focus area and programmes so OPPOTRON can match funding calls to the work you do.</p>
  </section>:
  <>
   <div className="fu-opportunities-summary"><span><Sparkles size={17}/> <strong>{loading?'—':matched.length}</strong> profile-aligned funding calls</span><small>Published opportunities only · Eligibility must be verified against funder requirements</small></div>
   <div className="fu-toolbar"><label className="fu-search"><Search size={18}/><input aria-label="Search your funding matches" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search funding, funders or programmes…"/></label>
    <select aria-label="Funding sector" value={sector} onChange={e=>setSector(e.target.value)}><option value="">All focus areas</option>{sectors.map(x=><option key={x}>{x}</option>)}</select></div>
   {loading?<div className="bo-skeleton-wrap">{[1,2,3].map(i=><div className="bo-skeleton" key={i}/>)}</div>:
    visible.length?<div className="fu-opportunity-grid">{visible.map(({op,match:m})=><article className="fu-opportunity-card" key={op.id}>
     <div className="fu-card-overline"><span><HeartHandshake size={15}/> {op.sector||'Funding'}</span><span>{op.verificationStatus==='verified'?'Source reviewed':'Review source'}</span></div>
     <h3>{op.title}</h3><p className="fu-funder">{op.funder}</p>
     <p className="fu-desc">{op.description||'Description unavailable. Review the original source.'}</p>
     <div className="fu-match-summary"><Sparkles size={17}/><span><strong>{m.score}/95 relevance score</strong><small>{m.reasons[0]||'Review eligibility carefully'}</small></span></div>
     <div className="fu-meta"><span><CalendarDays size={14}/>{op.deadline?displayDate(op.deadline):'Deadline unverified'}</span><span>{op.amount||'Amount not specified'}</span></div>
     <div className="fu-card-actions"><button className="bo-outline" onClick={()=>void save(op)} disabled={working===op.id}><Bookmark size={16} fill={saved.includes(op.id)?'currentColor':'none'}/>{saved.includes(op.id)?'Saved':'Save'}</button><button className="bo-primary" onClick={()=>setSelected(op)}>View details <ArrowRight size={16}/></button></div>
    </article>)}</div>:<section className="fu-empty"><span className="fu-empty-symbol"><HeartHandshake size={28}/></span>
     <h2>{all.length?'No matches for your current profile.':'Funding sources are being added.'}</h2>
     <p>{all.length?'Try expanding your NPO profile or clearing the search filter. We only show published calls aligned to your mission.':'The administration team is discovering and reviewing funding calls. Verified records will appear here when published.'}</p>
    </section>}
  </>}
  {selected&&<div className="fu-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}>
   <section className="fu-modal" role="dialog" aria-modal="true" aria-labelledby="fu-modal-title">
    <div className="fu-modal-head"><div><span className="bo-small-kicker">FUNDING OPPORTUNITY</span><h2 id="fu-modal-title">{selected.title}</h2><p>{selected.funder} · {selected.sector}</p></div><button className="fu-close" aria-label="Close" onClick={()=>setSelected(null)}><X size={21}/></button></div>
    <div className="fu-modal-body">
     <div className="fu-detail-badges"><span><CalendarDays size={15}/> {displayDate(selected.deadline)}</span><span>{selected.amount||'Funding amount not specified'}</span><span>{selected.coverage||'Coverage unverified'}</span></div>
     <p className="fu-detail-text">{selected.description||'The original source does not provide a summary.'}</p>
     <h3><Sparkles size={17}/> Why it may match your NPO</h3>
     <div className="fu-detail-list">{(match?.reasons.length?match.reasons:['No confirmed alignment evidence']).map(x=><p key={x}><CheckCircle2 size={15}/>{x}</p>)}</div>
     <h3><ShieldCheck size={17}/> Eligibility & requirements</h3>
     <p className="fu-detail-text">{selected.eligibility||'Eligibility conditions have not been verified.'}</p>
     <p className="fu-detail-text">{selected.registration?('Registration: '+selected.registration):'Registration requirements not specified.'}</p>
     <div className="fu-detail-list">{(selected.requirements||[]).map(x=><p key={x}><FileText size={15}/>{x}</p>)}</div>
     {match?.missingDocuments.length?<><h3><FolderOpen size={17}/> Documents to check</h3><div className="fu-detail-list">{match.missingDocuments.map(x=><p key={x}><FolderOpen size={15}/>{x} — not found by filename/category; confirm the actual contents.</p>)}</div></>:null}
     {match?.gaps.length?<><h3>What still needs verification</h3><div className="fu-detail-list">{match.gaps.map(x=><p key={x}><LockKeyhole size={15}/>{x}</p>)}</div></>:null}
     {(selected.documents||[]).length?<><h3>Supporting documents</h3><div className="fu-detail-list">{selected.documents.map((d,i)=><p key={i}><FileText size={15}/>{d.status==='stored'&&d.storageKey?<button onClick={()=>void openStored(selected,d.storageKey!)}>{d.title} · Open stored PDF</button>:<a href={d.sourceUrl} target="_blank" rel="noopener noreferrer">{d.title} · Official source</a>}</p>)}</div></>:null}
     <p className="fu-source-note">This is an AI-assisted relevance estimate, not a decision about eligibility. Verify requirements, amounts and deadlines on the official source before applying.</p>
    </div>
    <div className="fu-modal-actions"><button className="bo-outline" onClick={()=>{onPrepare(selected);setSelected(null);}}><FilePenLine size={15}/> Prepare document</button><button className="bo-outline" onClick={()=>void start(selected)} disabled={working===selected.id}><ClipboardCheck size={15}/>{applications.includes(selected.id)?'Open application':'Track application'}</button>{selected.applicationUrl||selected.sourceUrl?<a className="bo-primary" href={selected.applicationUrl||selected.sourceUrl} target="_blank" rel="noopener noreferrer">Official application <ArrowUpRight size={16}/></a>:null}</div>
   </section>
  </div>}
 </>;
}
