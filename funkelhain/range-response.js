// Range responses for Safari media seeking, using only the complete local cache.
(function(root){
 async function mediaResponse(response,range,method='GET'){
  if(!response)return new Response('Spieldatei fehlt.',{status:404});
  if(!range&&method!=='HEAD')return response;
  const bytes=await response.arrayBuffer(),size=bytes.byteLength;
  const headers=new Headers(response.headers);headers.set('Accept-Ranges','bytes');
  if(!range){headers.set('Content-Length',String(size));return new Response(null,{status:200,headers});}
  const match=/^bytes=(\d*)-(\d*)$/.exec(range.trim());let start,end;
  if(match&&(match[1]||match[2])){
   if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
   else {const suffix=Number(match[2]);start=Math.max(0,size-suffix);end=size-1;if(!suffix)start=size;}
  }
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start){headers.set('Content-Range','bytes */'+size);headers.set('Content-Length','0');return new Response(null,{status:416,headers});}
  headers.set('Content-Range',`bytes ${start}-${end}/${size}`);headers.set('Content-Length',String(end-start+1));
  return new Response(method==='HEAD'?null:bytes.slice(start,end+1),{status:206,headers});
 }
 root.FunkelhainMediaResponse=mediaResponse;
})(globalThis);
