export default async function handler(req, res) {
  const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

  if (!GOOGLE_MAPS_API_KEY) {
    console.error("SERVER ERROR: GOOGLE_MAPS_API_KEY environment variable not found.");
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  try {
    if (req.method === 'GET') {
      const { input } = req.query;
      if (!input) return res.status(400).json({ error: 'Missing input parameter' });
      
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${GOOGLE_MAPS_API_KEY}`;
      const googleResponse = await fetch(url);
      const data = await googleResponse.json();

      // Add server-side logging to see what Google returns
      if (data.status !== 'OK') {
        console.log(`Google Places API returned status: ${data.status}. Error: ${data.error_message || 'No error message.'}`);
      }

      return res.status(200).json(data);
      
    } else if (req.method === 'POST') {
      const { place_id } = req.body;
      if (!place_id) return res.status(400).json({ error: 'Missing place_id parameter' });

      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place_id)}&key=${GOOGLE_MAPS_API_KEY}`;
      const googleResponse = await fetch(url);
      const data = await googleResponse.json();

      // Add server-side logging
      if (data.status !== 'OK') {
        console.log(`Google Place Details API returned status: ${data.status}. Error: ${data.error_message || 'No error message.'}`);
      }

      return res.status(200).json(data);
    } 
  } catch (error) {
    console.error('Places proxy error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}