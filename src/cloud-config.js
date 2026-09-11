export function readConfig(env={}) {
  const url=env.VITE_SUPABASE_URL?.trim(), key=env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if(!url && !key)return {clientConfig:null,error:''};
  try {
    const parsed=new URL(url);
    if(parsed.protocol!=='https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname) || parsed.pathname!=='/' || parsed.search || parsed.hash || parsed.port || parsed.username || parsed.password)throw new Error();
    if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))throw new Error();
    return {clientConfig:{url:parsed.origin,key},error:''};
  } catch {return {clientConfig:null,error:'La configuración de Supabase no es válida. Revisa la URL y la clave pública publishable.'};}
}
export function configureHeaders(template,env) {
  const config=readConfig(env);
  if(config.error)throw new Error(config.error);
  return template.replace("connect-src 'self'",`connect-src 'self'${config.clientConfig?' '+config.clientConfig.url:''}`);
}
