import { createDirectus, rest, staticToken, readItems, createItem } from '@directus/sdk';

// Directus schema types
interface BugReport {
  id?: string;
  company: string | number;  // Many-to-one relationship to companies
  project: string | number;  // Many-to-one relationship to projects
  description: string;
  page_url: string;
  images?: Array<{ directus_files_id: string }>;  // Files array (M2M with directus_files)
  status?: string;
  created_at?: string;
  updated_at?: string;
}

interface Company {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

interface Project {
  id: string;
  company: string | number;  // Many-to-one relationship to companies
  name: string;
  is_active: boolean;
}

// Initialize Directus client
export function getDirectusClient() {
  const url = import.meta.env.DIRECTUS_URL;
  const token = import.meta.env.DIRECTUS_TOKEN;

  if (!url || !token) {
    throw new Error('Directus URL and Token must be configured in environment variables');
  }

  return createDirectus<{
    bug_reports: BugReport[];
    companies: Company[];
    projects: Project[];
  }>(url)
    .with(rest())
    .with(staticToken(token));
}

// Get all active companies
export async function getCompanies(): Promise<Company[]> {
  const client = getDirectusClient();
  try {
    const companies = await client.request(
      readItems('companies', {
        filter: {
          is_active: {
            _eq: true,
          },
        },
        sort: ['name'],
      })
    );
    return companies as Company[];
  } catch (error) {
    console.error('Error fetching companies:', error);
    throw error;
  }
}

// Get projects for a specific company
export async function getProjects(companyId: string): Promise<Project[]> {
  const client = getDirectusClient();
  try {
    const projects = await client.request(
      readItems('projects', {
        filter: {
          company: {
            _eq: companyId,
          },
          is_active: {
            _eq: true,
          },
        },
        sort: ['name'],
      })
    );
    return projects as Project[];
  } catch (error) {
    console.error('Error fetching projects:', error);
    throw error;
  }
}

// Get company by slug
export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  const client = getDirectusClient();
  try {
    const companies = await client.request(
      readItems('companies', {
        filter: {
          slug: {
            _eq: slug,
          },
          is_active: {
            _eq: true,
          },
        },
        limit: 1,
      })
    );
    return (companies as Company[])[0] || null;
  } catch (error) {
    console.error('Error fetching company by slug:', error);
    throw error;
  }
}

// Submit bug report
export async function submitBugReport(data: {
  company_id: string;
  project_id: string;
  description: string;
  page_url: string;
  imageIds?: string[];
}): Promise<BugReport> {
  const client = getDirectusClient();
  
  try {
    const imagesPayload = data.imageIds && data.imageIds.length > 0
      ? data.imageIds.map(fileId => ({ directus_files_id: fileId }))
      : undefined;

    const createPayload: any = {
      company: data.company_id,
      project: data.project_id,
      description: data.description,
      page_url: data.page_url,
      status: 'pending',
    };

    if (imagesPayload) {
      createPayload.images = imagesPayload;
    }

    const bugReport = await client.request(
      createItem('bug_reports', createPayload)
    );

    return bugReport as BugReport;
  } catch (error) {
    console.error('Error submitting bug report:', error);
    throw error;
  }
}

// Upload files to Directus
export async function uploadImages(files: File[]): Promise<string[]> {
  const url = import.meta.env.DIRECTUS_URL;
  const token = import.meta.env.DIRECTUS_TOKEN;

  if (!url || !token) {
    throw new Error('Directus URL and Token must be configured in environment variables');
  }

  try {
    const fileIds: string[] = [];
    
    // Upload files one by one (Directus REST API)
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${url}/files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to upload file ${file.name}: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      const result = await response.json();
      // Directus returns file data with id field
      if (result.data && result.data.id) {
        fileIds.push(result.data.id);
      } else if (result.id) {
        fileIds.push(result.id);
      } else {
        throw new Error(`Unexpected response format for file ${file.name}`);
      }
    }

    return fileIds;
  } catch (error) {
    console.error('Error uploading images:', error);
    throw error;
  }
}
