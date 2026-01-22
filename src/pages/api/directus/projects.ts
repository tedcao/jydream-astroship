import type { APIRoute } from 'astro';
import { getProjects, getCompanyBySlug } from '@lib/directus';

// Disable prerendering for this API route (needs runtime access to query params)
export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    // Get query parameters from URL
    const companySlug = url.searchParams.get('company');
    const companyId = url.searchParams.get('companyId');

    let targetCompanyId: string | null = companyId;

    // If company slug is provided but no companyId, get the company ID from slug
    if (companySlug && !companyId) {
      const company = await getCompanyBySlug(companySlug);
      if (!company) {
        return new Response(
          JSON.stringify({ 
            error: 'Company not found',
            details: `No company found with slug: ${companySlug}`
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      targetCompanyId = String(company.id);
    }

    // Validate that we have a companyId
    if (!targetCompanyId || targetCompanyId.trim() === '') {
      return new Response(
        JSON.stringify({ 
          error: 'Missing parameter',
          details: 'Please provide either company or companyId parameter'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get projects for the company
    const projects = await getProjects(targetCompanyId);
    return new Response(
      JSON.stringify({ projects }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch projects',
        details: error.message 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
