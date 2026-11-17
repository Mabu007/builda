import React, {useEffect,useMemo,useState} from 'react';
import type {User} from 'firebase/auth';
import {collection,deleteDoc,doc,onSnapshot,query,serverTimestamp,setDoc,where} from 'firebase/firestore';
import {ArrowRight,ArrowUpRight,Bookmark,CalendarDays,ClipboardCheck,ExternalLink,FilePenLine,FileText,HeartHandshake,Info,Mail,MapPin,Phone,Search,Sparkles,Wallet,X} from 'lucide-react';
import {db} from '../firebase';
import {matchOpportunity,profileProgress,type FundingOpportunity} from './funding';
import {confirmedCall} from './confirmed-funding';
import {NPO_FUNDING_CATEGORIES,fundingCategory} from './funding-categories';
import {applicationRoute,applicationSteps,daysToDeadline,displayFundingDate,fundingState,fundingStatusText,importantCondition,plainSummary,whoCanApply} from './opportunity-display';
import DirectoryPagination,{clampPage} from './DirectoryPagination';
import './funding-ui.css';
type Props={user:User;profile:Record<string,string>;files:{name:string;category:string}[];onPrepare:(op:FundingOpportunity)=>void;onApplications:()=>void;onProfile:()=>void;onFunder:(name:string)=>void;openOpportunityId?:string;onOpenHandled?:()=>void};
export default function FundingOpportunities({user,profile,files,onPrepare,onApplications,onProfile,onFunder,openOpportunityId,onOpenHandled}:Props){
 const [all,setAll]=useState<FundingOpportunity[]>([]),[saved,setSaved]=useState<string[]>([]),[applications,setApplications]=useState<string[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState<FundingOpportunity|null>(null);
 const [search,setSearch]=useState(''),[sector,setSector]=useState(''),[working,setWorking]=useState('');
 const pageSize=12;
 const [page,setPage]=useState(1);
 useEffect(()=>{
  if(!db){setError('Firestore is not configured.');setLoading(false);return;}
  const u=onSnapshot(query(collection(db,'opportunities'),where('published','==',true)),snap=>{
   setAll(snap.docs.map(entry=>({...entry.data(),id:entry.id} as FundingOpportunity)));setLoading(false);setError('');
  },()=>{setError('Funding opportunities cannot be loaded. Check Firestore rules and retry.');setLoading(false);});
  const s=onSnapshot(collection(db,'contractors',user.uid,'savedFunding'),snap=>setSaved(snap.docs.map(item=>item.id)),()=>setError('Saved opportunities could not be loaded.'));
  const a=onSnapshot(collection(db,'contractors',user.uid,'applications'),snap=>setApplications(snap.docs.map(item=>item.id)),()=>setError('Applications could not be loaded.'));
  return()=>{u();s();a();};
 },[user.uid]);
 useEffect(()=>{
  if(!openOpportunityId)return;
  const found=all.find(op=>op.id===openOpportunityId);
  if(found){setSelected(found);onOpenHandled?.();}
 },[openOpportunityId,all,onOpenHandled]);
 useEffect(()=>{
  if(!selected)return;
  const previous=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setSelected(null);};
  window.addEventListener('keydown',onKey);
  return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey);};
 },[Boolean(selected)]);
 const readiness=profileProgress(profile);
 const sectors=NPO_FUNDING_CATEGORIES;
 const matched=useMemo(()=>all.filter(op=>op.status==='published').map(op=>({op,match:matchOpportunity(op,profile,files)}))
  .sort((a,b)=>{
   // Verified active application windows take precedence over undated or
   // unverified enquiries; expired records always appear last.
   const ranks={open:0,enquire:1,closed:2};
   const stateDiff=ranks[fundingState(a.op)]-ranks[fundingState(b.op)];
   return stateDiff || (readiness.personalised?b.match.score-a.match.score:0) ||
    (a.op.deadline||'9999').localeCompare(b.op.deadline||'9999') || a.op.title.localeCompare(b.op.title);
  }),[all,profile,files,readiness.personalised]);
 const visible=useMemo(()=>matched.filter(row=>(!sector||fundingCategory(row.op)===sector)&&(!search||[row.op.title,row.op.funder,row.op.sector,row.op.description,row.op.contactEmail||'',row.op.contactPhone||''].join(' ').toLowerCase().includes(search.trim().toLowerCase()))),[matched,sector,search]);
 const currentPage=clampPage(page,visible.length,pageSize);
 const pageItems=useMemo(()=>visible.slice((currentPage-1)*pageSize,currentPage*pageSize),[visible,currentPage]);
 useEffect(()=>setPage(1),[search,sector]);
 const save=async(op:FundingOpportunity)=>{
  if(!db||working)return;setWorking(op.id);
  try{
   const ref=doc(db,'contractors',user.uid,'savedFunding',op.id);
   if(saved.includes(op.id))await deleteDoc(ref);
   else await setDoc(ref,{opportunityId:op.id,savedAt:serverTimestamp(),notes:''});
  }catch{setError('Unable to save this opportunity. Check Firestore permissions.');}finally{setWorking('');}
 };
 const start=async(op:FundingOpportunity)=>{
  if(!db||working)return;
  if(applications.includes(op.id)){setSelected(null);onApplications();return;}
  setWorking(op.id);
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
 const confirmed=selected?confirmedCall(selected):undefined;
 const route=selected?applicationRoute(selected):null;
 const selectedState=selected?fundingState(selected):'enquire';
 const remaining=selected?daysToDeadline(selected):null;
 return <>
  <div className="bo-page-heading"><div><div className="bo-eyebrow"><HeartHandshake size={14}/> FUNDING INTELLIGENCE</div><h1>Funding opportunities<span className="bo-heading-dot">.</span></h1><p>Explore every published funding call. Add 30% of your profile to see opportunities ranked for your organisation.</p></div></div>
  {error&&<div className="bo-inline-error" role="alert">{error}<button onClick={()=>window.location.reload()}>Retry</button></div>}
  {!readiness.personalised&&<section className="fu-onboarding-banner">
   <div><strong>All funding calls are available now.</strong><p>Complete 3 of 10 profile details to get personalised rankings. Your feed will never be hidden.</p>
    <div className="fu-onboarding-progress"><span style={{width:readiness.percent+'%'}}/></div><small>{readiness.percent}% completed · Personalisation begins at 30%</small>
   </div><button className="bo-outline" onClick={onProfile}>Add profile details <ArrowRight size={16}/></button>
  </section>}
   <div className="fu-opportunities-summary"><span><Sparkles size={17}/> <strong>{loading?'—':matched.length}</strong> published opportunities</span><small>{readiness.personalised?'Tailored ranking enabled · All opportunities remain visible':'Browse without a profile · Personalisation starts at 30%'} · Check funder requirements</small></div>
   <div className="fu-toolbar"><label className="fu-search"><Search size={18}/><input aria-label="Search funding opportunities" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search funding, funders or programmes…"/></label>
    <select aria-label="Funding sector" value={sector} onChange={e=>setSector(e.target.value)}><option value="">All 11 focus areas</option>{sectors.map(x=><option key={x}>{x}</option>)}</select></div>
   {loading?<div className="bo-skeleton-wrap">{[1,2,3].map(i=><div className="bo-skeleton" key={i}/>)}</div>:
    visible.length?<><div className="fu-opportunity-grid">{pageItems.map(({op})=><article className="fu-opportunity-card" key={op.id}>
     <div className="fu-card-overline"><span><HeartHandshake size={15}/> {fundingCategory(op)}</span><span className={'fu-card-state fu-state-'+fundingState(op)}>{fundingStatusText(op)}</span></div>
     <h3>{op.title}</h3><p className="fu-funder">{op.funder}</p>
     <p className="fu-desc">{plainSummary(op)}</p>
      
     
     <div className="fu-meta"><span><CalendarDays size={14}/>{op.deadline?displayFundingDate(op.deadline):'No deadline listed'}</span><span>{op.amount||'Amount not specified'}</span></div>
     <div className="fu-card-actions"><button className="bo-outline" onClick={()=>void save(op)} disabled={working===op.id}><Bookmark size={16} fill={saved.includes(op.id)?'currentColor':'none'}/>{saved.includes(op.id)?'Saved':'Save'}</button><button className="bo-primary" onClick={()=>setSelected(op)}>View details <ArrowRight size={16}/></button></div>
    </article>)}</div><DirectoryPagination page={currentPage} pageSize={pageSize} total={visible.length} label="opportunities" onPage={setPage}/></>:<section className="fu-empty"><span className="fu-empty-symbol"><HeartHandshake size={28}/></span>
     <h2>{all.length?'No opportunities match these filters.':'Funding sources are being added.'}</h2>
     <p>{all.length?'Try clearing the search or selecting all focus areas. Every published call remains accessible.':'The administration team is discovering and reviewing funding calls. Published records will appear here automatically.'}</p>
    </section>}
  {selected&&<div className="fu-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}>
   <section className="fu-modal fu-modal-redesign" role="dialog" aria-modal="true" aria-labelledby="fu-modal-title">
    <div className="fu-modal-head fu-modal-header">
     <div className="fu-modal-heading">
      <div className="fu-modal-eyebrow"><span className={'fu-status-pill fu-status-'+selectedState}><span className="fu-status-dot"/>{fundingStatusText(selected)}</span><span>{confirmed?.type||selected.researchType||selected.sector||'Funding opportunity'}</span></div>
      <h2 id="fu-modal-title">{selected.title}</h2>
      <button className="fu-funder-nav" onClick={()=>{onFunder(selected.funder);setSelected(null);}}><HeartHandshake size={15}/>{selected.funder||'Funder not specified'}<ArrowRight size={14}/></button>
     </div>
     <button className="fu-close" aria-label="Close funding opportunity" onClick={()=>setSelected(null)}><X size={21}/></button>
    </div>
    <div className="fu-modal-body fu-modal-main">
     <div className="fu-funding-facts">
      <div className="fu-funding-fact"><span><CalendarDays size={16}/> Application deadline</span><strong>{selected.deadline?displayFundingDate(selected.deadline):'Contact funder'}</strong><small>{selectedState==='closed'?'Applications have closed':selectedState==='open'&&remaining!==null?(remaining===0?'Closes today':remaining===1?'Closes tomorrow':remaining+' days left'):'Confirm the application window'}</small></div>
      <div className="fu-funding-fact"><span><Wallet size={16}/> Funding or support</span><strong>{confirmed?.amount||selected.amount||'Not specified'}</strong><small>{confirmed?.type||selected.researchType||selected.sector||'Programme support'}</small></div>
      <div className="fu-funding-fact"><span><MapPin size={16}/> Where it applies</span><strong>{confirmed?.coverage||selected.coverage||'Ask the funder'}</strong><small>Location eligibility</small></div>
     </div>
     <div className="fu-modal-story">
      <div className="fu-modal-section"><h3>What is this opportunity?</h3><p>{plainSummary(selected)}</p></div>
      <div className="fu-modal-section"><h3>Who can apply?</h3><p>{whoCanApply(selected)}</p>{selected.registration&&<p className="fu-requirement-inline"><Info size={15}/> Registration: {selected.registration}</p>}</div>
      {importantCondition(selected)&&<div className="fu-important-condition"><Info size={19}/><div><strong>Important to know</strong><p>{importantCondition(selected)}</p></div></div>}
      <div className="fu-modal-section fu-how-apply"><h3>How to apply</h3><ol>{applicationSteps(selected).map((step,index)=><li key={index}><span>{index+1}</span><p>{step}</p></li>)}</ol>
       {(confirmed?.contactEmail||selected.contactEmail||selected.contactPhone)&&<div className="fu-contact-links">
        {(confirmed?.contactEmail||selected.contactEmail)&&<a href={'mailto:'+(confirmed?.contactEmail||selected.contactEmail)}><Mail size={16}/>{confirmed?.contactEmail||selected.contactEmail}</a>}
        {selected.contactPhone&&<a href={'tel:'+selected.contactPhone.replace(/[^\d+]/g,'')}><Phone size={16}/>{selected.contactPhone}</a>}
       </div>}
      </div>
      {(selected.requirements?.length>0||selected.documents?.length>0)&&<div className="fu-modal-section"><h3>Documents and requirements</h3>
       {selected.requirements?.length>0&&<ul className="fu-check-list">{selected.requirements.map((item,index)=><li key={index}><FileText size={15}/>{item}</li>)}</ul>}
       {selected.documents?.length>0&&<div className="fu-supporting-files">{selected.documents.map((document,index)=><div key={index}><FileText size={15}/>{document.status==='stored'&&document.storageKey?<button onClick={()=>void openStored(selected,document.storageKey!)}>{document.title} · Open PDF</button>:<a href={document.sourceUrl} target="_blank" rel="noopener noreferrer">{document.title} <ExternalLink size={13}/></a>}</div>)}</div>}
      </div>}
      {(confirmed?.sourceUrl||selected.sourceUrl)&&<div className="fu-source-link"><span>{confirmed?'Funder details checked on 17 Nov 2026':'Funding details from the listed source'}</span><a href={confirmed?.sourceUrl||selected.sourceUrl} target="_blank" rel="noopener noreferrer">Read official information <ExternalLink size={14}/></a></div>}
     </div>
    </div>
    <div className="fu-modal-actions fu-modal-footer">
     <button className="bo-outline" onClick={()=>{onPrepare(selected);setSelected(null);}}><FilePenLine size={17}/> Prepare documents</button>
     <button className="bo-outline" onClick={()=>void start(selected)} disabled={working===selected.id}><ClipboardCheck size={17}/>{applications.includes(selected.id)?'Open application':'Track application'}</button>
     {selectedState==='closed'?(confirmed?.sourceUrl||selected.sourceUrl?<a className="bo-primary" href={confirmed?.sourceUrl||selected.sourceUrl} target="_blank" rel="noopener noreferrer">View closed call <ExternalLink size={17}/></a>:<button className="bo-primary" disabled>Applications closed</button>):route?<a className="bo-primary" href={route.url} target={route.kind==='website'?'_blank':undefined} rel={route.kind==='website'?'noopener noreferrer':undefined}>{route.label} {route.kind==='email'?<Mail size={17}/>:route.kind==='phone'?<Phone size={17}/>:<ArrowUpRight size={17}/>}</a>:<button className="bo-primary" disabled title="Application details have not been supplied">Application details unavailable</button>}
    </div>
   </section>
  </div>}
 </>;
}
