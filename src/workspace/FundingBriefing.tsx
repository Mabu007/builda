import React,{useEffect,useMemo,useState} from 'react';
import {ArrowRight,CalendarDays,HeartHandshake,Sparkles} from 'lucide-react';
import {matchOpportunity,profileProgress,type FundingOpportunity} from './funding';
import {directoryRequest} from './directory-client';
import type {User} from 'firebase/auth';
import './funding-ui.css';
export default function FundingBriefing({user,profile,files,onOpen}:{user:User;profile:Record<string,string>;files:{name:string;category:string}[];onOpen:()=>void}){
 const [opportunities,setOpportunities]=useState<FundingOpportunity[]>([]);
 const [error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  directoryRequest<{items:FundingOpportunity[]}>(user,'/api/directory?kind=featured',
   {body:{profile},signal:controller.signal})
   .then(result=>{if(!controller.signal.aborted){setOpportunities(result.items);setLoaded(true);setError('');}})
   .catch(()=>{if(!controller.signal.aborted){setLoaded(true);setError('Could not load funding matches.');}});
  return()=>controller.abort();
 },[user.uid,profile]);
 const readiness=profileProgress(profile);
 const matches=useMemo(()=>opportunities.map(op=>({op,match:matchOpportunity(op,profile,files)})),
  [opportunities,profile,files]);
 return <section className="bo-panel fu-briefing"><div className="bo-panel-title"><div><div className="bo-small-kicker">YOUR OPPORTUNITY INTELLIGENCE</div><h3>Funding opportunities to explore</h3><p>{readiness.personalised?'Published calls ranked by your organisation’s profile.':'See published funding calls now. Personalised ranking starts at 30% profile completion.'}</p></div><span className="fu-briefing-icon"><HeartHandshake size={21}/></span></div>
  {matches.length?<div className="fu-briefing-items">{matches.map(({op,match})=><button key={op.id} onClick={onOpen}>
    <span className="fu-briefing-badge"><Sparkles size={13}/>{readiness.personalised?match.score+'/95':'Published'}</span><span><strong>{op.title}</strong><small>{op.funder} · {op.deadline?'Closes '+op.deadline:'Deadline not supplied'}</small></span><ArrowRight size={17}/></button>)}</div>:
  <div className="fu-briefing-empty"><span><Sparkles size={20}/></span><strong>{!loaded?'Looking for matches…':error?'Funding feed unavailable':'No published funding calls yet'}</strong><p>{error||'Published grants and CSI calls will appear here as soon as the administrator adds them.'}</p></div>}
  <button className="fu-briefing-footer" onClick={onOpen}>Explore funding opportunities <ArrowRight size={16}/></button>
 </section>;
}
