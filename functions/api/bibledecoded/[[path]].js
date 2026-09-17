import {handle,json,HttpError} from '../../_lib/bd-api.js';
import {paymentDiagnostic} from '../../_lib/bd-diagnostics.js';
export async function onRequest({request,env}){
 try{return await handle(request,env);}catch(error){
  if(error instanceof HttpError)return json({error:error.message,...error.extra},error.status);
  const reference=crypto.randomUUID(),diagnostic=paymentDiagnostic(error);
  console.error(JSON.stringify({event:'bibledecoded_request_failed',reference,...diagnostic}));
  const purchase=new URL(request.url).pathname.endsWith('/claim');
  return json({error:purchase?`We could not confirm your purchase. You have not been charged again. Please contact info@tryjesusmedia.com with reference ${reference}.`:`We could not finish that request. Please try again. Your typed answers remain on this device until saved. Reference: ${reference}`,reference},503);
 }
}
