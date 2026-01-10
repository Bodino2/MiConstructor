import axios from 'axios';

export async function getETA(origin: string, destination: string) {
  if (!process.env.GOOGLE_MAPS_KEY) {
    throw new Error('GOOGLE_MAPS_KEY is not set');
  }

  const res = await axios.get(
    'https://maps.googleapis.com/maps/api/directions/json',
    {
      params: {
        origin,
        destination,
        key: process.env.GOOGLE_MAPS_KEY,
      },
    },
  );

  const route = res.data?.routes?.[0];
  const leg = route?.legs?.[0];
  if (!route || !leg) {
    throw new Error('No route found for provided origin/destination');
  }

  return {
    duration: leg.duration?.text,
    distance: leg.distance?.text,
    polyline: route.overview_polyline?.points,
  };
}
