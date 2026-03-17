export default async function handler(req, res) {
  const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  try {
    const { origins, destinations } = req.body;

    if (!origins || !destinations) {
      return res.status(400).json({ error: 'Missing origins or destinations' });
    }

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`;
    const googleResponse = await fetch(url);
    const data = await googleResponse.json();

    if (!googleResponse.ok) return res.status(googleResponse.status).json(data);

    return res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}