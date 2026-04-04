async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token'
    })
  });
  return res.json();
}

export default async function handler(req, res) {
  const { action, accessToken, refreshToken, caseData, calendarId } = req.body || {};
  const targetCalendar = calendarId || 'primary';

  let token = accessToken;

  // Refresh token if needed
  if (!token && refreshToken) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (refreshed.error) return res.status(401).json({ error: 'Token refresh failed' });
    token = refreshed.access_token;
  }

  if (!token) return res.status(401).json({ error: 'No access token' });

  // CREATE event
  if (action === 'create') {
    const { nome, lado, diag, proc, data, rh, tel1, ocupacao } = caseData;
    const sideLabel = lado === 'D' ? 'Direito' : lado === 'E' ? 'Esquerdo' : lado === 'B' ? 'Bilateral' : '';
    
    const description = [
      `RH: ${rh || '—'}`,
      ocupacao ? `Ocupação: ${ocupacao}` : '',
      tel1 ? `Tel: ${tel1}` : '',
      diag ? `Diagnóstico: ${diag}` : '',
      proc ? `Procedimento: ${proc}` : ''
    ].filter(Boolean).join('\n');

    const event = {
      summary: `${nome}${sideLabel ? ` — ${sideLabel}` : ''}`,
      description,
      start: { date: data },
      end: { date: data }
    };

    const eventRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendar)}/events`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      }
    );

    const eventData = await eventRes.json();
    return res.status(eventRes.ok ? 200 : 400).json(eventData);
  }

  // FETCH events (sync from calendar)
  if (action === 'fetch') {
    const { dateMin, dateMax } = req.body;
    const params = new URLSearchParams({
      timeMin: new Date(dateMin || Date.now()).toISOString(),
      timeMax: new Date(dateMax || Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '100'
    });

    const eventsRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendar)}/events?${params}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    const eventsData = await eventsRes.json();
    return res.status(eventsRes.ok ? 200 : 400).json(eventsData);
  }

  // LIST calendars
  if (action === 'list_calendars') {
    const calRes = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const calData = await calRes.json();
    return res.status(calRes.ok ? 200 : 400).json(calData);
  }

  res.status(400).json({ error: 'Invalid action' });
}
