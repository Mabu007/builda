import React,{useEffect,useMemo,useState} from 'react';
import type {User} from 'firebase/auth';
import {collection,onSnapshot,query,where} from 'firebase/firestore';
import {ArrowRight,ArrowUpRight,Building2,CalendarDays,ExternalLink,HeartHandshake,Mail,Phone,Search,ShieldCheck} from 'lucide-react';
import {db} from '../firebase';
import type {FundingOpportunity} from './funding';
import {confirmedFunderContacts} from './confirmed-funding';
import {displayFundingDate,fundingState} from './opportunity-display';
import './funding-ui.css';

type HistoricalCsi={reported2024_25Rm:number|null;reported2024_25Label:string;reported2023_24Rm:number|null;reported2023_24Label:string;focus:string;report:string;handbookPage:number;qualification:string;reportPeriod:string;researchStatus:string};
export type PublicFunder={id:string;name:string;description:string;focus:string[];support:string[];geography:string;website:string;contactEmail:string;contactPhone:string;historicalCsi?:HistoricalCsi};
type Props={user:User;focusName?:string;onOpportunity:(id:string)=>void};
export default function Funders({user,focusName='',onOpportunity}:Props){
 const [funders,setFunders]=useState<PublicFunder[]>([]),[opportunities,setOpportunities]=useState<FundingOpportunity[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(focusName),[expanded,setExpanded]=useState('');
 useEffect(()=>{if(focusName){setSearch(focusName);setExpanded(focusName);}},[focusName]);
 useEffect(()=>{
  let active=true;
  (async()=>{
   try{
    const token=await user.getIdToken();
    const result=await fetch('/api/funders',{headers:{Authorization:'Bearer '+token}});
    const json=await result.json().catch(()=>({}));
    if(!result.ok)throw new Error(json.error||'Unable to load funders.');
    if(active){setFunders(json.items||[]);setError('');}
   }catch(e){if(active)setError(e instanceof Error?e.message:'Unable to load the funder directory.');}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[user.uid]);
 useEffect(()=>{
  if(!db)return;
  return onSnapshot(query(collection(db,'opportunities'),where('published','==',true)),snapshot=>{
   setOpportunities(snapshot.docs.map(entry=>({...entry.data(),id:entry.id} as FundingOpportunity)));
  },()=>setError('Published funding calls could not be loaded.'));
 },[]);
 const linked=useMemo(()=>{
  const map=new Map<string,FundingOpportunity[]>();
  for(const opportunity of opportunities){
   if(opportunity.status!=='published')continue;
   const key=opportunity.funder.trim().toLowerCase();
   const list=map.get(key)||[];list.push(opportunity);map.set(key,list);
  }
  for(const list of map.values())list.sort((a,b)=>Number(fundingState(a)!=='open')-Number(fundingState(b)!=='open')||(a.deadline||'9999').localeCompare(b.deadline||'9999'));
  return map;
 },[opportunities]);
 const results=useMemo(()=>funders.filter(f=>{
  const text=[f.name,f.description,f.geography,...f.focus,...f.support].join(' ').toLowerCase();
  return !search.trim()||text.includes(search.trim().toLowerCase());
 }),[funders,search]);
 return <section className="fu-funders-page">
  <div className="bo-page-heading"><div><div className="bo-eyebrow"><Building2 size={15}/> FUNDING ORGANISATIONS</div><h1>Funders<span className="bo-heading-dot">.</span></h1><p>Discover organisations that support nonprofits. Explore what they fund, how to reach them and their opportunities.</p></div></div>
  <div className="fu-funders-intro"><div><strong>{loading?'—':funders.length}</strong><span>funders in the directory</span></div><p>Includes historical corporate CSI funders. Explore their focus areas and look for separately listed, currently open funding calls.</p></div>
  {error&&<p className="bo-inline-error" role="alert">{error}<button onClick={()=>window.location.reload()}>Retry</button></p>}
  <label className="fu-search fu-funders-search"><Search size={18}/><input aria-label="Search funders" placeholder="Search funders, focus areas, programmes…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
  {loading?<div className="bo-skeleton-wrap">{[1,2,3].map(i=><div key={i} className="bo-skeleton"/>)}</div>:results.length?
   <div className="fu-funder-table-wrap"><table className="fu-funder-table"><thead><tr><th>FUNDER</th><th>WHAT THEY SUPPORT</th><th>OPPORTUNITIES</th><th>CONTACT</th></tr></thead>
    <tbody>{results.map(f=>{
     const calls=linked.get(f.name.toLowerCase())||[];
     const contact=confirmedFunderContacts[f.name];
     const email=f.contactEmail||contact?.email||'';
     const website=f.website||contact?.website||'';
     return <React.Fragment key={f.id||f.name}><tr className={expanded===f.name?'fu-funder-row-expanded':''}>
      <td><strong>{f.name}</strong><small>{f.geography||'South Africa'}</small><button className="fu-funder-info" aria-expanded={expanded===f.name} onClick={()=>setExpanded(expanded===f.name?'':f.name)}>{expanded===f.name?'Hide details':'About this funder'} <ArrowRight size={13}/></button></td>
      <td><div className="fu-funder-focus">{(f.focus||[]).length?f.focus.slice(0,3).map(x=><span key={x}>{x}</span>):<span>General funding</span>}</div><small>{f.description||f.support?.slice(0,2).join(' · ')||'See the funder’s website for priorities.'}</small></td>
      <td><span className="fu-funder-count">{calls.length?calls.length+' listed '+(calls.length===1?'opportunity':'opportunities'):'No listed calls'}</span>
       {calls.slice(0,2).map(op=><button key={op.id} className="fu-funder-call-link" onClick={()=>onOpportunity(op.id)}>{op.title} <ArrowRight size={13}/></button>)}
       {calls.length>2&&<button className="fu-funder-info" onClick={()=>setExpanded(f.name)}>+{calls.length-2} more</button>}</td>
      <td><div className="fu-funder-contact">{email&&<a href={'mailto:'+email}><Mail size={15}/> Email</a>}{f.contactPhone&&<a href={'tel:'+f.contactPhone.replace(/[^\d+]/g,'')}><Phone size={15}/> Call</a>}{website&&<a href={website} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Website</a>}{!email&&!f.contactPhone&&!website&&<span>Not supplied</span>}</div></td>
     </tr>
     {expanded===f.name&&<tr className="fu-funder-expanded"><td colSpan={4}><div className="fu-funder-detail">
      <div><h3>About {f.name}</h3><p>{f.description||'This organisation has been identified as a potential funding or support provider. Check its website for current priorities.'}</p>
        {f.historicalCsi&&<div className="fu-csi-history"><div className="fu-csi-history-heading">Historical CSI research · Trialogue 2025</div>
         <div className="fu-csi-figures"><div><small>Reported 2024/25 CSI</small><strong>{f.historicalCsi.reported2024_25Rm!==null?'R'+f.historicalCsi.reported2024_25Rm.toLocaleString('en-ZA')+' million':f.historicalCsi.reported2024_25Label}</strong></div><div><small>2023/24 comparison</small><strong>{f.historicalCsi.reported2023_24Rm!==null?'R'+f.historicalCsi.reported2023_24Rm.toLocaleString('en-ZA')+' million':f.historicalCsi.reported2023_24Label}</strong></div></div>
         <p><strong>Original source:</strong> {f.historicalCsi.report} (handbook p. {f.historicalCsi.handbookPage}).</p>
         {f.historicalCsi.qualification&&<p><strong>Important qualification:</strong> {f.historicalCsi.qualification}</p>}
         <p className="fu-csi-disclaimer">These are historical company-reported CSI figures, NOT grant amounts available for applications. Confirm current opportunities and contact channels with the company.</p>
        </div>}{f.support?.length>0&&<p><strong>Support offered:</strong> {f.support.join(' · ')}</p>}{f.geography&&<p><strong>Coverage:</strong> {f.geography}</p>}</div>
      <div><h3>Funding opportunities</h3>{calls.length?calls.map(op=><button className="fu-funder-opportunity" key={op.id} onClick={()=>onOpportunity(op.id)}><span><strong>{op.title}</strong><small><CalendarDays size={12}/>{displayFundingDate(op.deadline)} · {fundingState(op)==='closed'?'Closed':fundingState(op)==='open'?'Open for applications':'Contact funder'}</small></span><ArrowRight size={17}/></button>):<p>No publicly listed call from this funder in OPPOTRON yet. The funder may still accept enquiries or announce future funding windows.</p>}</div>
     </div></td></tr>}
    </React.Fragment>;
    })}</tbody></table></div>:
    <div className="fu-empty"><HeartHandshake size={28}/><h2>{funders.length?'No funders match that search.':'Funders are being added.'}</h2><p>{funders.length?'Try a different organisation name or funding focus.':'The directory will fill as funders are reviewed and added.'}</p></div>}
  <div className="fu-directory-footnote"><ShieldCheck size={16}/><p>Organisations listed here are potential sources of funding or support, not a promise that applications are currently open. Only publicly listed funding calls appear as opportunities.</p></div>
 </section>;
}
