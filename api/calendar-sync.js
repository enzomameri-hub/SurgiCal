async function getServiceAccountToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
 
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
 
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const payload = btoa(JSON.stringify(claim)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const signingInput = `${header}.${payload}`;
 
  const pemBody = privateKey
    .replace('-----BEGIN RSA PRIVATE KEY-----','').replace('-----END RSA PRIVATE KEY-----','')
    .replace('-----BEGIN PRIVATE KEY-----','').replace('-----END PRIVATE KEY-----','')
    .replace(/\s/g,'');
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
 
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyData.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
 
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const jwt = `${signingInput}.${sigB64}`;
 
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
 
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}
 
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  const { action, caseData, calendarId, dateMin, dateMax } = req.body || {};
  const targetCalendar = calendarId || 'ortopbarueri@gmail.com';
 
  try {
    const token = await getServiceAccountToken();
    if (!token) return res.status(401).json({ error: 'Failed to get service account token' });
 
    if (action === 'create') {
      const { nome, lado, diag, proc, data, rh, tel1, ocupacao } = caseData;
      const sideLabel = lado==='D'?'Direito':lado==='E'?'Esquerdo':lado==='B'?'Bilateral':'';
      const description = [
        rh?`RH: ${rh}`:'', ocupacao?`Ocupação: ${ocupacao}`:'',
        tel1?`Tel: ${tel1}`:'', diag?`Diagnóstico: ${diag}`:'', proc?`Procedimento: ${proc}`:''
      ].filter(Boolean).join('\n');
 
      const event = {
        summary: `${nome}${sideLabel?` — ${sideLabel}`:''}`,
        description,
        start: { date: data },
        end: { date: data }
      };
 
      const eventRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendar)}/events`,
        { method:'POST', headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'}, body:JSON.stringify(event) }
      );
      return res.status(eventRes.ok?200:400).json(await eventRes.json());
    }
 
    if (action === 'fetch') {
      const params = new URLSearchParams({
        timeMin: new Date(dateMin||Date.now()).toISOString(),
        timeMax: new Date(dateMax||Date.now()+120*24*60*60*1000).toISOString(),
        singleEvents:'true', orderBy:'startTime', maxResults:'200'
      });
      const eventsRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendar)}/events?${params}`,
        { headers:{'Authorization':`Bearer ${token}`} }
      );
      return res.status(eventsRes.ok?200:400).json(await eventsRes.json());
    }
 
    res.status(400).json({ error: 'Invalid action' });
  } catch(err) {
    console.error('Calendar error:', err);
    res.status(500).json({ error: err.message });
  }
}
