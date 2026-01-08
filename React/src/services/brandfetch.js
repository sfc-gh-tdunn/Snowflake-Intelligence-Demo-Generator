import { getBrandfetchToken } from '../config/endpoints';

/**
 * Fetch brand data (logos and colors) from Brandfetch API
 * @param {string} companyUrl - The company URL (e.g., "snowflake.com")
 * @returns {Promise<Object>} Brand data including logos and colors
 */
export const fetchBrandData = async (companyUrl) => {
  const token = getBrandfetchToken();
  
  if (!token) {
    throw new Error('Brandfetch token not configured');
  }

  // Clean up the URL (remove http://, https://, www.)
  const cleanUrl = companyUrl
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];

  const response = await fetch(`https://api.brandfetch.io/v2/brands/${cleanUrl}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch brand data: ${response.status}`);
  }

  const data = await response.json();
  
  // Extract logos (prefer icon or logo formats)
  const logos = (data.logos || []).slice(0, 5).map(logo => {
    const format = logo.formats?.[0] || {};
    return {
      src: format.src || '',
      type: logo.type || 'logo',
      theme: logo.theme || 'light',
    };
  }).filter(logo => logo.src);

  // Extract colors
  const colors = (data.colors || []).slice(0, 5).map(color => ({
    hex: color.hex || '#000000',
    type: color.type || 'primary',
  }));

  return {
    name: data.name || '',
    domain: data.domain || cleanUrl,
    logos,
    colors,
    description: data.description || '',
  };
};

