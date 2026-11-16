import React,{useEffect,useMemo,useState} from 'react';
import {collection,onSnapshot,query,where} from 'firebase/firestore';
import {ArrowRight,CalendarDays,HeartHandshake,Sparkles} from 'lucide-react';
import {db} from '../firebase';
import {matchOpportunity,opportunityExpired,profileProgress,type FundingOpportunity} from './funding';
import './funding-ui.css';
export default function FundingBriefing({profile,files,onOpen}:{profile:Record<string,string>;files:{name:string;category:string}[];onOpen:()=>void}){
 const [opportunities,setOpportunities]=useState<FundingOpportunity[]>([]);
 const [error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 useEffect(()=>{
  if(!db){setLoaded(true);setError('Funding database is not configured.');return;}
  return onSnapshot(query(collection(db,'opportunities'),where('published','==',true)),snap=>{
   setOpportunities(snap.docs.map(x=>({...x.data(),id:x.id} as FundingOpportunity)));setLoaded(true);setError('');
  },()=>{setLoaded(true);setError('Could not load funding matches.');});
 },[]);
 const readiness=profileProgress(profile);
 const matches=useMemo(()=>opportunities.filter(x=>x.status==='published')
  .map(op=>({op,match:matchOpportunity(op,profile,files)}))
  .sort((a,b)=>Number(opportunityExpired(a.op))-Number(opportunityExpired(b.op)) ||
   (readiness.personalised?b.match.score-a.match.score:0) ||
   (a.op.deadline||'9999').localeCompare(b.op.deadline||'9999'))
  .slice(0,3),[opportunities,profile,files,readiness.personalised]);
 return <section className="bo-panel fu-briefing"><div className="bo-panel-title"><div><div className="bo-small-kicker">YOUR OPPORTUNITY INTELLIGENCE</div><h3>Funding opportunities to explore</h3><p>{readiness.personalised?'Published calls ranked by your organisation’s profile.':'See published funding calls now. Personalised ranking starts at 30% profile completion.'}</p></div><span className="fu-briefing-icon"><HeartHandshake size={21}/></span></div>
  {matches.length?<div className="fu-briefing-items">{matches.map(({op,match})=><button key={op.id} onClick={onOpen}>
    <span className="fu-briefing-badge"><Sparkles size={13}/>{readiness.personalised?match.score+'/95':'Published'}</span><span><strong>{op.title}</strong><small>{op.funder} · {op.deadline?'Closes '+op.deadline:'Deadline unverified'}</small></span><ArrowRight size={17}/></button>)}</div>:
  <div className="fu-briefing-empty"><span><Sparkles size={20}/></span><strong>{!loaded?'Looking for matches…':error?'Funding feed unavailable':!profile.category&&!profile.description&&!profile.services?'Complete 30% of your profile to unlock personalised ranking':'No published funding calls yet'}</strong><p>{error||'Published grants and CSI calls will appear here as soon as the administrator adds them.'}</p></div>}
  <button className="fu-briefing-footer" onClick={onOpen}>Explore funding opportunities <ArrowRight size={16}/></button>
 </section>;
}
