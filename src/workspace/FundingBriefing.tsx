import React,{useEffect,useMemo,useState} from 'react';
import {collection,onSnapshot,query,where} from 'firebase/firestore';
import {ArrowRight,CalendarDays,HeartHandshake,Sparkles} from 'lucide-react';
import {db} from '../firebase';
import {matchOpportunity,opportunityExpired,type FundingOpportunity} from './funding';
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
 const matches=useMemo(()=>opportunities.filter(x=>x.status==='published'&&!opportunityExpired(x))
  .map(o=>({op:o,match:matchOpportunity(o,profile,files)})).filter(item=>item.match.eligible)
  .sort((a,b)=>b.match.score-a.match.score).slice(0,3),[opportunities,profile,files]);
 return <section className="bo-panel fu-briefing"><div className="bo-panel-title"><div><div className="bo-small-kicker">YOUR OPPORTUNITY INTELLIGENCE</div><h3>Funding opportunities for your NPO</h3><p>Published calls matched to your saved mission and programmes.</p></div><span className="fu-briefing-icon"><HeartHandshake size={21}/></span></div>
  {matches.length?<div className="fu-briefing-items">{matches.map(({op,match})=><button key={op.id} onClick={onOpen}>
    <span className="fu-briefing-badge"><Sparkles size={13}/>{match.score}/95</span><span><strong>{op.title}</strong><small>{op.funder} · {op.deadline?'Closes '+op.deadline:'Deadline unverified'}</small></span><ArrowRight size={17}/></button>)}</div>:
  <div className="fu-briefing-empty"><span><Sparkles size={20}/></span><strong>{!loaded?'Looking for matches…':error?'Funding feed unavailable':!profile.category&&!profile.description&&!profile.services?'Complete your mission and programmes to unlock matching':'No matching published funding calls yet'}</strong><p>{error||'As verified grants and CSI calls are published, relevant opportunities will appear here.'}</p></div>}
  <button className="fu-briefing-footer" onClick={onOpen}>Explore funding opportunities <ArrowRight size={16}/></button>
 </section>;
}
