export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.redirect('/?calendar_error=access_denied');
  }

  if (!code) {
    return res.redirect('/?calendar_error=no_code');
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = 'https://surgi-cal-five.vercel.app/api/calendar-callback';

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      return res.redirect(`/?calendar_error=${tokens.error}`);
    }

    const params = new URLSearchParams({
      calendar_access_token: tokens.access_token,
      calendar_refresh_token: tokens.refresh_token || '',
      calendar_expires_in: tokens.expires_in || '3600'
    });

    res.redirect(`/?${params.toString()}`);
  } catch (err) {
    res.redirect(`/?calendar_error=${encodeURIComponent(err.message)}`);
  }
}
