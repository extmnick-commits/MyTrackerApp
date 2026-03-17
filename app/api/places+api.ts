// Use standard Web Request and Response types for API routes

// The API key is securely accessed from environment variables on the server.
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

/**
 * Handles GET requests for Google Places Autocomplete suggestions.
 * Example: /api/places?input=New York
 */
export async function GET(request: Request) {
  if (!GOOGLE_MAPS_API_KEY) {
    return Response.json({ error: 'API key not configured on server' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const input = searchParams.get('input');

  if (!input) {
    return Response.json({ error: 'Missing input parameter' }, { status: 400 });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${GOOGLE_MAPS_API_KEY}`;
    const googleResponse = await fetch(url);
    const data = await googleResponse.json();

    if (!googleResponse.ok) {
      return Response.json(data, { status: googleResponse.status });
    }

    return Response.json(data);
  } catch (error: any) {
    console.error('Places Autocomplete proxy error:', error);
    return Response.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

/**
 * Handles POST requests for Google Place Details.
 * Example: /api/places (with { place_id: 'ChIJ...' } in body)
 */
export async function POST(request: Request) {
  if (!GOOGLE_MAPS_API_KEY) {
    return Response.json({ error: 'API key not configured on server' }, { status: 500 });
  }

  try {
    const { place_id } = await request.json();

    if (!place_id) {
      return Response.json({ error: 'Missing place_id parameter' }, { status: 400 });
    }

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place_id)}&key=${GOOGLE_MAPS_API_KEY}`;
    const googleResponse = await fetch(url);
    const data = await googleResponse.json();

    if (!googleResponse.ok) {
      return Response.json(data, { status: googleResponse.status });
    }

    return Response.json(data);
  } catch (error: any) {
    console.error('Place Details proxy error:', error);
    return Response.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}