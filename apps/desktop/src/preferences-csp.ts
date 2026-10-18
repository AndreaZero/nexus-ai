import {publicServiceUrl} from './auth-config.ts';

function decodeAttribute(value:string):string {
 return value.replace(/&(?:amp|quot|apos|lt|gt|#x[0-9a-f]{1,6}|#[0-9]{1,7});/giu,entity=>{
  const named:Record<string,string>={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};
  const name=named[entity.toLowerCase()];if(name!==undefined)return name;
  const hex=entity[2]?.toLowerCase()==='x';const code=Number.parseInt(entity.slice(hex?3:2,-1),hex?16:10);
  if(code===0||code>0x10ffff||code>=0xd800&&code<=0xdfff)throw new Error('Invalid renderer policy character reference.');
  return String.fromCodePoint(code);
 });
}
function encodeAttribute(value:string,quote:string):string {
 return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll(quote,quote==='"'?'&quot;':'&#39;');
}

/** Rebind the generated index policy to this profile's one selected authority. */
export function rendererConnectionPolicy(html:string,server:string):string {
 const origin=publicServiceUrl(server);
 const socket=new URL(origin);socket.protocol=socket.protocol==='https:'?'wss:':'ws:';
 const matches=[...html.matchAll(/<meta\b[^>]*>/giu)].flatMap(match=>{
  const attrs=[...match[0].matchAll(/\b(http-equiv|content)\s*=\s*(["'])(.*?)\2/giu)];
  const equiv=attrs.filter(attr=>attr[1]?.toLowerCase()==='http-equiv');
  if(!equiv.some(attr=>decodeAttribute(attr[3]??'').toLowerCase()==='content-security-policy'))return[];
  if(equiv.length!==1)throw new Error('Renderer policy is ambiguous.');
  const content=attrs.filter(attr=>attr[1]?.toLowerCase()==='content');
  if(content.length!==1)throw new Error('Renderer policy content is missing or ambiguous.');
  return[{tag:match[0],offset:match.index,content:content[0]!}];
 });
 if(matches.length!==1)throw new Error('Exactly one renderer policy is required.');
 const match=matches[0]!;const policy=decodeAttribute(match.content[3]!);
 const names=new Set<string>();let connections=0;
 const updated=policy.split(';').map(directive=>{
  const name=/^\s*([a-z-]+)/iu.exec(directive)?.[1]?.toLowerCase();
  if(!name)return directive;
  if(names.has(name))throw new Error('Duplicate renderer policy directive.');names.add(name);
  if(name!=='connect-src')return directive;
  connections++;
  return `${/^\s*/u.exec(directive)![0]}connect-src 'self' ${origin} ${socket.origin}${/\s*$/u.exec(directive)![0]}`;
 }).join(';');
 if(connections!==1)throw new Error('Renderer connection policy is missing.');
 const content=match.content;const replacement=`content=${content[2]}${encodeAttribute(updated,content[2]!)}${content[2]}`;
 const tag=match.tag.slice(0,content.index)+replacement+match.tag.slice(content.index+content[0].length);
 return html.slice(0,match.offset)+tag+html.slice(match.offset+match.tag.length);
}
