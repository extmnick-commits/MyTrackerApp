// Use standard Web Request and Response types for API routes

// This API key is now read from an environment variable on the server.
// It is no longer exposed to the client-side on the web.
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function POST(request: Request) {
  if (!GOOGLE_MAPS_API_KEY) {
    return Response.json({ error: 'API key not configured on server' }, { status: 500 });
  }

  try {
    const { origins, destinations } = await request.json();

    if (!origins || !destinations) {
      return Response.json({ error: 'Missing origins or destinations' }, { status: 400 });
    }

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`;
    
    const googleResponse = await fetch(url);
    const data = await googleResponse.json();

    if (!googleResponse.ok) {
        return Response.json(data, { status: googleResponse.status });
    }

    return Response.json(data);

  } catch (error: any) {
    console.error('Proxy error:', error);
    return Response.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}