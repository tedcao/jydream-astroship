import type { APIRoute } from 'astro';
import { submitBugReport, uploadImages, getDirectusClient } from '@lib/directus';
import { readItems } from '@directus/sdk';

// Disable prerendering for this API route
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    
    // Extract form fields
    const companyId = formData.get('company_id') as string;
    const projectId = formData.get('project_id') as string;
    const description = formData.get('description') as string;
    const pageUrl = formData.get('page_url') as string;
    const imageFiles = formData.getAll('images') as File[];

    // Validation
    const errors: string[] = [];

    if (!companyId || companyId.trim() === '') {
      errors.push('Company is required');
    }

    if (!projectId || projectId.trim() === '') {
      errors.push('Project is required');
    }

    // Verify company and project exist and are valid
    if (companyId && projectId && errors.length === 0) {
      try {
        const client = getDirectusClient();
        
        // Verify company exists
        const companies = await client.request(
          readItems('companies', {
            filter: {
              id: { _eq: companyId },
              is_active: { _eq: true }
            },
            limit: 1
          })
        );
        if (!companies || companies.length === 0) {
          errors.push('Invalid company selected');
        }
        
        // Verify project exists and belongs to the company
        const projects = await client.request(
          readItems('projects', {
            filter: {
              id: { _eq: projectId },
              company: { _eq: companyId },
              is_active: { _eq: true }
            },
            limit: 1
          })
        );
        if (!projects || projects.length === 0) {
          errors.push('Invalid project selected or project does not belong to the selected company');
        }
      } catch (verifyError: any) {
        errors.push(`Validation error: ${verifyError.message}`);
      }
    }

    if (!description || description.trim() === '') {
      errors.push('Description is required');
    } else if (description.trim().length < 10) {
      errors.push('Description must be at least 10 characters');
    }

    if (!pageUrl || pageUrl.trim() === '') {
      errors.push('Page URL is required');
    } else {
      try {
        new URL(pageUrl);
      } catch {
        errors.push('Page URL must be a valid URL');
      }
    }

    // Filter out empty files
    const validImageFiles = imageFiles.filter(file => file.size > 0);
    
    if (validImageFiles.length === 0) {
      errors.push('At least one image is required');
    } else if (validImageFiles.length > 10) {
      errors.push('Maximum 10 images allowed');
    }

    // Validate file types and sizes
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    for (const file of validImageFiles) {
      if (!allowedTypes.includes(file.type)) {
        errors.push(`Invalid file type: ${file.name}. Only JPEG, PNG, GIF, and WebP are allowed`);
      }
      if (file.size > maxSize) {
        errors.push(`File too large: ${file.name}. Maximum size is 5MB`);
      }
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: 'Validation failed',
          details: errors 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Upload images
    let imageIds: string[] = [];
    if (validImageFiles.length > 0) {
      try {
        imageIds = await uploadImages(validImageFiles);
      } catch (uploadError: any) {
        return new Response(
          JSON.stringify({ 
            error: 'Failed to upload images',
            details: uploadError.message 
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Submit bug report
    try {
      const bugReport = await submitBugReport({
        company_id: companyId.trim(),
        project_id: projectId.trim(),
        description: description.trim(),
        page_url: pageUrl.trim(),
        imageIds,
      });

      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Bug report submitted successfully',
          id: bugReport.id 
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (submitError: any) {
      return new Response(
        JSON.stringify({ 
          error: 'Failed to submit bug report',
          details: submitError.message 
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
