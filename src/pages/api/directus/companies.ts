import type { APIRoute } from 'astro';
import { getCompanies } from '@lib/directus';

// Disable prerendering for this API route
export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const companies = await getCompanies();
    return new Response(
      JSON.stringify({ companies }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch companies',
        details: error.message 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
