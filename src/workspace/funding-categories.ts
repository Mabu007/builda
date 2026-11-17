import type {FundingOpportunity} from './funding';

export const NPO_FUNDING_CATEGORIES=[
 'Education & Research',
 'Social Services & Welfare',
 'Health & Wellness',
 'Arts, Culture & Recreation',
 'Community Development & Housing',
 'Environment & Conservation',
 'Law, Advocacy & Human Rights',
 'Religion & Faith-Based Services',
 'Philanthropy & Volunteering',
 'Business & Professional Associations',
 'International Activities'
] as const;

export function fundingCategory(op:Pick<FundingOpportunity,'sector'|'title'|'description'>):string{
 const sector=(op.sector||'').toLowerCase();
 const text=sector+' '+String(op.title||'')+' '+String(op.description||'').slice(0,200);
 const label=NPO_FUNDING_CATEGORIES.find(category=>category.toLowerCase()===sector);
 if(label)return label;
 if(/religious|faith|church|mosque|worship/.test(sector))return NPO_FUNDING_CATEGORIES[7];
 if(/philanthrop|volunteer|grantmaker/.test(sector))return NPO_FUNDING_CATEGORIES[8];
 if(/international|humanitarian international|cross.border/.test(sector))return NPO_FUNDING_CATEGORIES[10];
 if(/association|trade union|professional bod|cooperative|skills programme|seta|enterprise|economic empower|business/.test(sector))return NPO_FUNDING_CATEGORIES[9];
 if(/law|justice|rights|advocac|gender|women empower|victim/.test(sector))return NPO_FUNDING_CATEGORIES[6];
 if(/environment|climat|conserv|wildlife|recycl|ecolog/.test(sector))return NPO_FUNDING_CATEGORIES[5];
 if(/arts|culture|recreation|sport|music|dance|theatre/.test(sector))return NPO_FUNDING_CATEGORIES[3];
 if(/health|wellness|mental|disability|hiv|aids/.test(sector))return NPO_FUNDING_CATEGORIES[2];
 if(/education|research|literacy|learning|ecd|early childhood|school|youth develop/.test(sector))return NPO_FUNDING_CATEGORIES[0];
 if(/food|welfare|shelter|social|child protection|older person/.test(sector))return NPO_FUNDING_CATEGORIES[1];
 if(/community|housing|poverty|development/.test(sector))return NPO_FUNDING_CATEGORIES[4];
 // Default to community development rather than inventing a niche restriction.
 return /international|global|africa-wide/i.test(text)?NPO_FUNDING_CATEGORIES[10]:NPO_FUNDING_CATEGORIES[4];
}
