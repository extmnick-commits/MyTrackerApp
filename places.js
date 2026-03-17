export default async function handler(req, res) {
  const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

  if (!GOOGLE_MAPS_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  try {
    if (req.method === 'GET') {
      const { input } = req.query;
      if (!input) return res.status(400).json({ error: 'Missing input parameter' });
      
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${GOOGLE_MAPS_API_KEY}`;
      const googleResponse = await fetch(url);
      const data = await googleResponse.json();
      return res.status(200).json(data);
      
    } else if (req.method === 'POST') {
      const { place_id } = req.body;
      if (!place_id) return res.status(400).json({ error: 'Missing place_id parameter' });

      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place_id)}&key=${GOOGLE_MAPS_API_KEY}`;
      const googleResponse = await fetch(url);
      const data = await googleResponse.json();
      return res.status(200).json(data);
    } 
  } catch (error) {
    console.error('Places proxy error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}