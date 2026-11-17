import React,{useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {ArrowRight,Building2,CalendarDays,ExternalLink,Globe,HeartHandshake,Mail,Phone,Search,X} from 'lucide-react';
import type {FundingOpportunity} from './funding';
import {confirmedFunderContacts} from './confirmed-funding';
import {displayFundingDate,fundingState} from './opportunity-display';
import DirectoryPagination from './DirectoryPagination';
import {directoryRequest,type DirectoryPage} from './directory-client';
import './funding-ui.css';

export type PublicFunder={id:string;name:string;description:string;focus:string[];geography:string;website:string;contactEmail:string;contactPhone:string;openCallCount:number};
type Props={user:User;focusName?:string;onOpportunity:(id:string)=>void};
export default function Funders({user,focusName='',onOpportunity}:Props){
 const [funders,setFunders]=useState<PublicFunder[]>([]);
 const [total,setTotal]=useState(0),[page,setPage]=useState(1);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const [search,setSearch]=useState(focusName),[debouncedSearch,setDebouncedSearch]=useState(focusName);
 const [selected,setSelected]=useState<PublicFunder|null>(null);
 const [selectedCalls,setSelectedCalls]=useState<FundingOpportunity[]>([]);
 const [callsLoading,setCallsLoading]=useState(false),[callsError,setCallsError]=useState('');
 const pageSize=20;
 useEffect(()=>{if(focusName){setSearch(focusName);setDebouncedSearch(focusName);setPage(1);setSelected(null);}},[focusName]);
 useEffect(()=>{
  const timer=window.setTimeout(()=>{setDebouncedSearch(search);setPage(1);},260);
  return()=>window.clearTimeout(timer);
 },[search]);
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);
  const url='/api/funders?page='+page+'&limit='+pageSize+'&q='+encodeURIComponent(debouncedSearch);
  directoryRequest<DirectoryPage<PublicFunder>>(user,url,{signal:controller.signal})
   .then(result=>{
    if(controller.signal.aborted)return;
    setFunders(result.items);setTotal(result.total);setError('');setLoading(false);
    if(result.page>1&&!result.items.length&&result.total>0)setPage(Math.max(1,Math.ceil(result.total/pageSize)));
   }).catch(e=>{
    if(controller.signal.aborted)return;
    setError(e instanceof Error?e.message:'Unable to load funders.');setLoading(false);
   });
  return()=>controller.abort();
 },[user.uid,page,debouncedSearch]);
 useEffect(()=>{
  if(!selected){setSelectedCalls([]);setCallsError('');return;}
  const controller=new AbortController();
  setCallsLoading(true);setCallsError('');setSelectedCalls([]);
  directoryRequest<{items:FundingOpportunity[]}>(user,
   '/api/directory?kind=funder-calls&name='+encodeURIComponent(selected.name),{signal:controller.signal})
   .then(data=>{if(!controller.signal.aborted){setSelectedCalls(data.items);setCallsLoading(false);}})
   .catch(e=>{if(!controller.signal.aborted){setCallsError(e instanceof Error?e.message:'Calls unavailable');setCallsLoading(false);}});
  return()=>controller.abort();
 },[user.uid,selected?.id,selected?.name]);
 useEffect(()=>{
  if(!selected)return;
  const old=document.body.style.overflow;document.body.style.overflow='hidden';
  const esc=(event:KeyboardEvent)=>{if(event.key==='Escape')setSelected(null);};
  window.addEventListener('keydown',esc);return()=>{document.body.style.overflow=old;window.removeEventListener('keydown',esc);};
 },[Boolean(selected)]);
 const getContact=(f:PublicFunder)=>{
  const known=confirmedFunderContacts[f.name];
  return {website:f.website||known?.website||'',email:f.contactEmail||known?.email||'',phone:f.contactPhone||''};
 };
 const contacts=(f:PublicFunder,compact=false)=>{
  const c=getContact(f);
  return <div className={'fu-directory-contacts'+(compact?' compact':'')}>
   {c.website&&<a href={c.website} target="_blank" rel="noopener noreferrer" title={'Official website for '+f.name}><Globe size={15}/>{compact?'Website':new URL(c.website).hostname.replace(/^www\./,'')}<ExternalLink size={12}/></a>}
   {c.email&&<a href={'mailto:'+c.email} title={'Email '+f.name}><Mail size={15}/>{compact?'Email':c.email}</a>}
   {c.phone&&<a href={'tel:'+c.phone.replace(/[^\d+]/g,'')} title={'Call '+f.name}><Phone size={15}/>{compact?'Call':c.phone}</a>}
   {!c.website&&!c.email&&!c.phone&&<span className="fu-directory-no-contact">Contact not listed</span>}
  </div>;
 };
 return <section className="fu-funders-page">
  <div className="bo-page-heading"><div><div className="bo-eyebrow"><Building2 size={15}/> FUNDER DIRECTORY</div><h1>Funders<span className="bo-heading-dot">.</span></h1><p>Find who supports your work, view available calls and contact the funder directly.</p></div></div>
  {error&&<div className="bo-inline-error" role="alert">{error}<button onClick={()=>window.location.reload()}>Retry</button></div>}
  <div className="fu-directory-toolbar"><label className="fu-search"><Search size={18}/><input aria-label="Search funders" placeholder="Search a funder or funding focus…" value={search} onChange={e=>setSearch(e.target.value)}/></label><span>{loading?'Loading…':total+' funders'}</span></div>
  {loading?<div className="bo-skeleton-wrap">{[1,2,3].map(i=><div key={i} className="bo-skeleton"/>)}</div>:funders.length?
   <div className="fu-simple-directory"><table><thead><tr><th>FUNDER</th><th>WHAT THEY SUPPORT</th><th>OPPORTUNITIES</th><th>CONTACT</th></tr></thead>
    <tbody>{funders.map(f=>{
     const callCount=f.openCallCount||0;
     return <tr key={f.id||f.name}>
      <td data-label="FUNDER"><button className="fu-directory-name" onClick={()=>setSelected(f)}><strong>{f.name}</strong><ArrowRight size={15}/></button></td>
      <td data-label="WHAT THEY SUPPORT"><span className="fu-directory-focus">{f.focus.slice(0,3).join(' · ')||f.description||'Programme information available on request'}</span></td>
      <td data-label="OPPORTUNITIES">{callCount?<button className="fu-directory-opps" onClick={()=>setSelected(f)}><span>{callCount} available {callCount===1?'call':'calls'}</span><ArrowRight size={14}/></button>:<span className="fu-directory-muted">No open calls listed</span>}</td>
      <td data-label="CONTACT">{contacts(f,true)}</td>
     </tr>;
    })}</tbody></table><DirectoryPagination page={page} pageSize={pageSize} total={total} label="funders" onPage={setPage}/></div>:
   <div className="fu-empty"><HeartHandshake size={28}/><h2>No funders found</h2><p>{total?'Try a different search.':'Funders will appear after being added.'}</p></div>}
  {selected&&<div className="fu-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}>
   <section className="fu-funder-sheet" role="dialog" aria-modal="true" aria-labelledby="fu-funder-title">
    <header className="fu-funder-sheet-head"><div><div className="fu-modal-eyebrow">FUNDER DETAILS</div><h2 id="fu-funder-title">{selected.name}</h2></div><button aria-label="Close funder details" onClick={()=>setSelected(null)}><X size={20}/></button></header>
    <div className="fu-funder-sheet-body">
     <section><h3>What they support</h3><div className="fu-funder-sheet-tags">{selected.focus.length?selected.focus.map(x=><span key={x}>{x}</span>):<span>Contact the funder for priorities</span>}</div>{selected.description&&<p>{selected.description}</p>}{selected.geography&&<p><strong>Area:</strong> {selected.geography}</p>}</section>
     <section><h3>Funding opportunities</h3>{callsLoading?<p>Loading available calls…</p>:callsError?<p role="alert">{callsError}</p>:selectedCalls.length?selectedCalls.map(op=><button key={op.id} className="fu-funder-opportunity" onClick={()=>{setSelected(null);onOpportunity(op.id);}}><span><strong>{op.title}</strong><small><CalendarDays size={13}/>{op.deadline?displayFundingDate(op.deadline):'Contact funder'} · {op.amount||'Amount not stated'}</small></span><ArrowRight size={17}/></button>):<p>No currently listed calls. You can contact this funder or check its official website for upcoming applications.</p>}</section>
     <section><h3>Contact</h3>{contacts(selected)}</section>
    </div>
   </section>
  </div>}
 </section>;
}
