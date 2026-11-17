import React from 'react';
import {ArrowLeft,ArrowRight} from 'lucide-react';

// Keep all matches searchable, but only render the current page to the DOM.
export const countPages=(total:number,pageSize:number)=>Math.max(1,Math.ceil(total/pageSize));
export const clampPage=(page:number,total:number,pageSize:number)=>Math.max(1,Math.min(page,countPages(total,pageSize)));
type Props={page:number;pageSize:number;total:number;label:string;onPage:(page:number)=>void};
export default function DirectoryPagination({page,pageSize,total,label,onPage}:Props){
 const pages=countPages(total,pageSize),current=clampPage(page,total,pageSize);
 if(total<=pageSize)return null;
 const start=(current-1)*pageSize+1,end=Math.min(current*pageSize,total);
 return <nav className="fu-pagination" aria-label={label+' pagination'}>
  <span className="fu-pagination-summary">Showing {start}–{end} of {total} {label}</span>
  <div className="fu-pagination-controls">
   <button type="button" onClick={()=>onPage(current-1)} disabled={current===1} aria-label={'Previous '+label+' page'}><ArrowLeft size={16}/> Previous</button>
   <span className="fu-pagination-pages">Page {current} of {pages}</span>
   <button type="button" onClick={()=>onPage(current+1)} disabled={current===pages} aria-label={'Next '+label+' page'}>Next <ArrowRight size={16}/></button>
  </div>
 </nav>;
}
