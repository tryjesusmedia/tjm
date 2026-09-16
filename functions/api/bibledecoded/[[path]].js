import {handle,json,HttpError} from '../../_lib/bd-api.js';
export async function onRequest({request,env}){
 try{return await handle(request,env);}catch(error){
  if(error instanceof HttpError)return json({error:error.message,...error.extra},error.status);
  console.error(JSON.stringify({event:'bibledecoded_request_failed',kind:error?.name||'Error'}));
  return json({error:'We could not finish that request. Please try again. Your typed answers remain on this device until saved.'},503);
 }
}
