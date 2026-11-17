import React,{useEffect,useMemo,useState} from 'react';
import type {User} from 'firebase/auth';
import {collection,onSnapshot,query,where} from 'firebase/firestore';
import {ArrowRight,Building2,CalendarDays,ExternalLink,Globe,HeartHandshake,Mail,Phone,Search,X} from 'lucide-react';
import {db} from '../firebase';
import type {FundingOpportunity} from './funding';
import {confirmedFunderContacts} from './confirmed-funding';
import {displayFundingDate,fundingState} from './opportunity-display';
import './funding-ui.css';

export type PublicFunder={id:string;name:string;description:string;focus:string[];geography:string;website:string;contactEmail:string;contactPhone:string};
type Props={user:User;focusName?:string;onOpportunity:(id:string)=>void};
export default function Funders({user,focusName='',onOpportunity}:Props){
 const [funders,setFunders]=useState<PublicFunder[]>([]),[opportunities,setOpportunities]=useState<FundingOpportunity[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(focusName),[selected,setSelected]=useState<PublicFunder|null>(null);
 useEffect(()=>{if(focusName){setSearch(focusName);setSelected(null);}},[focusName]);
 useEffect(()=>{
  let active=true;
  (async()=>{
   try{
    const token=await user.getIdToken();
    const result=await fetch('/api/funders',{headers:{Authorization:'Bearer '+token}});
    const json=await result.json().catch(()=>({}));
    if(!result.ok)throw new Error(json.error||'Unable to load funders.');
    if(active){setFunders(json.items||[]);setError('');}
   }catch(e){if(active)setError(e instanceof Error?e.message:'Unable to load funders.');}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[user.uid]);
 useEffect(()=>{
  if(!db)return;
  return onSnapshot(query(collection(db,'opportunities'),where('published','==',true)),snapshot=>{
   setOpportunities(snapshot.docs.map(entry=>({...entry.data(),id:entry.id} as FundingOpportunity)));
  },()=>setError('Funding calls could not be loaded.'));
 },[]);
 useEffect(()=>{
  if(!selected)return;
  const old=document.body.style.overflow;document.body.style.overflow='hidden';
  const esc=(event:KeyboardEvent)=>{if(event.key==='Escape')setSelected(null);};
  window.addEventListener('keydown',esc);return()=>{document.body.style.overflow=old;window.removeEventListener('keydown',esc);};
 },[Boolean(selected)]);
 const linked=useMemo(()=>{
  const map=new Map<string,FundingOpportunity[]>();
  for(const op of opportunities){
   if(op.status!=='published'||fundingState(op)==='closed')continue;
   const name=op.funder.trim().toLowerCase();
   map.set(name,[...(map.get(name)||[]),op]);
  }
  for(const calls of map.values())calls.sort((a,b)=>(a.deadline||'9999').localeCompare(b.deadline||'9999'));
  return map;
 },[opportunities]);
 const results=useMemo(()=>funders.filter(f=>[f.name,f.description,...f.focus,f.geography].join(' ').toLowerCase().includes(search.trim().toLowerCase())),[funders,search]);
 const getContact=(f:PublicFunder)=>{
  const known=confirmedFunderContacts[f.name];
  return {website:f.website||known?.website||'',email:f.contactEmail||known?.email||'',phone:f.contactPhone||''};
 };
 const openCalls=(name:string)=>linked.get(name.trim().toLowerCase())||[];
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
  <div className="fu-directory-toolbar"><label className="fu-search"><Search size={18}/><input aria-label="Search funders" placeholder="Search a funder or funding focus…" value={search} onChange={e=>setSearch(e.target.value)}/></label><span>{loading?'Loading…':results.length+' funders'}</span></div>
  {loading?<div className="bo-skeleton-wrap">{[1,2,3].map(i=><div key={i} className="bo-skeleton"/>)}</div>:results.length?
   <div className="fu-simple-directory"><table><thead><tr><th>FUNDER</th><th>WHAT THEY SUPPORT</th><th>OPPORTUNITIES</th><th>CONTACT</th></tr></thead>
    <tbody>{results.map(f=>{
     const calls=openCalls(f.name);
     return <tr key={f.id||f.name}>
      <td data-label="FUNDER"><button className="fu-directory-name" onClick={()=>setSelected(f)}><strong>{f.name}</strong><ArrowRight size={15}/></button></td>
      <td data-label="WHAT THEY SUPPORT"><span className="fu-directory-focus">{f.focus.slice(0,3).join(' · ')||f.description||'Programme information available on request'}</span></td>
      <td data-label="OPPORTUNITIES">{calls.length?<button className="fu-directory-opps" onClick={()=>setSelected(f)}><span>{calls.length} available {calls.length===1?'call':'calls'}</span><ArrowRight size={14}/></button>:<span className="fu-directory-muted">No open calls listed</span>}</td>
      <td data-label="CONTACT">{contacts(f,true)}</td>
     </tr>;
    })}</tbody></table></div>:
   <div className="fu-empty"><HeartHandshake size={28}/><h2>No funders found</h2><p>{funders.length?'Try a different search.':'Funders will appear after being added.'}</p></div>}
  {selected&&<div className="fu-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}>
   <section className="fu-funder-sheet" role="dialog" aria-modal="true" aria-labelledby="fu-funder-title">
    <header className="fu-funder-sheet-head"><div><div className="fu-modal-eyebrow">FUNDER DETAILS</div><h2 id="fu-funder-title">{selected.name}</h2></div><button aria-label="Close funder details" onClick={()=>setSelected(null)}><X size={20}/></button></header>
    <div className="fu-funder-sheet-body">
     <section><h3>What they support</h3><div className="fu-funder-sheet-tags">{selected.focus.length?selected.focus.map(x=><span key={x}>{x}</span>):<span>Contact the funder for priorities</span>}</div>{selected.description&&<p>{selected.description}</p>}{selected.geography&&<p><strong>Area:</strong> {selected.geography}</p>}</section>
     <section><h3>Funding opportunities</h3>{openCalls(selected.name).length?openCalls(selected.name).map(op=><button key={op.id} className="fu-funder-opportunity" onClick={()=>{setSelected(null);onOpportunity(op.id);}}><span><strong>{op.title}</strong><small><CalendarDays size={13}/>{op.deadline?displayFundingDate(op.deadline):'Contact funder'} · {op.amount||'Amount not stated'}</small></span><ArrowRight size={17}/></button>):<p>No currently listed calls. You can contact this funder or check its official website for upcoming applications.</p>}</section>
     <section><h3>Contact</h3>{contacts(selected)}</section>
    </div>
   </section>
  </div>}
 </section>;
}
