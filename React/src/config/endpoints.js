// Runtime environment configuration
// Values are injected at container startup via docker-entrypoint.sh
const getEnv = (key, defaultValue = '') => {
  if (typeof window !== 'undefined' && window.__ENV__ && window.__ENV__[key]) {
    return window.__ENV__[key];
  }
  return defaultValue;
};

// Vertical to endpoint mapping
export const ENDPOINT_MAP = {
  'Retail': () => getEnv('API_ENDPOINT_RETAIL'),
  'Advertising, Media & Entertainment': () => getEnv('API_ENDPOINT_ADS'),
  'Financial Services': () => getEnv('API_ENDPOINT_FIN_INVESTMENT_PORTFOLIO_ANALYTICS'),
  'Health Services': () => getEnv('API_ENDPOINT_HS_CLINICAL_TRIALS'),
  'Manufacturing': () => getEnv('API_ENDPOINT_MAN_SUPPLY_CHAIN_ASSISTANT'),
};

// Sub-vertical specific endpoints (more granular)
export const SUB_VERTICAL_ENDPOINT_MAP = {
  'Financial Services': {
    'Investment Portfolio Analytics': () => getEnv('API_ENDPOINT_FIN_INVESTMENT_PORTFOLIO_ANALYTICS'),
    'Assets Management Advisor': () => getEnv('API_ENDPOINT_FIN_ASSETS_MANAGEMENT_ADVISOR'),
    'Claims Processor': () => getEnv('API_ENDPOINT_FIN_CLAIMS_PROCESSOR'),
  },
  'Health Services': {
    'Clinical Trials': () => getEnv('API_ENDPOINT_HS_CLINICAL_TRIALS'),
    'Genomics': () => getEnv('API_ENDPOINT_HS_GENOMICS'),
  },
  'Manufacturing': {
    'Predictive Maintenance': () => getEnv('API_ENDPOINT_MAN_PREDICTIVE_MAINTENANCE'),
    'Supply Chain Assistant': () => getEnv('API_ENDPOINT_MAN_SUPPLY_CHAIN_ASSISTANT'),
  },
};

// Vertical to auth token mapping
export const TOKEN_MAP = {
  'Retail': () => getEnv('RETAIL_AUTH_TOKEN'),
  'Advertising, Media & Entertainment': () => getEnv('ADS_AUTH_TOKEN'),
  'Financial Services': () => getEnv('FIN_INVESTMENT_PORTFOLIO_ANALYTICS_AUTH_TOKEN'),
  'Health Services': () => getEnv('HS_CLINICAL_TRIALS_AUTH_TOKEN'),
  'Manufacturing': () => getEnv('MAN_SUPPLY_CHAIN_ASSISTANT_AUTH_TOKEN'),
};

// Sub-vertical specific tokens
export const SUB_VERTICAL_TOKEN_MAP = {
  'Financial Services': {
    'Investment Portfolio Analytics': () => getEnv('FIN_INVESTMENT_PORTFOLIO_ANALYTICS_AUTH_TOKEN'),
    'Assets Management Advisor': () => getEnv('FIN_ASSETS_MANAGEMENT_ADVISOR_AUTH_TOKEN'),
    'Claims Processor': () => getEnv('FIN_CLAIMS_PROCESSOR_AUTH_TOKEN'),
  },
  'Health Services': {
    'Clinical Trials': () => getEnv('HS_CLINICAL_TRIALS_AUTH_TOKEN'),
    'Genomics': () => getEnv('HS_GENOMICS_AUTH_TOKEN'),
  },
  'Manufacturing': {
    'Predictive Maintenance': () => getEnv('MAN_PREDICTIVE_MAINTENANCE_AUTH_TOKEN'),
    'Supply Chain Assistant': () => getEnv('MAN_SUPPLY_CHAIN_ASSISTANT_AUTH_TOKEN'),
  },
};

// Get the appropriate endpoint for a vertical/sub-vertical combination
// customAgentUrl parameter allows overriding for Custom vertical
export const getEndpoint = (mainVertical, subVertical, customAgentUrl = null) => {
  // If custom agent URL is provided (for Custom vertical), use it
  if (customAgentUrl) {
    return customAgentUrl;
  }
  // Try sub-vertical specific endpoint first
  if (subVertical && SUB_VERTICAL_ENDPOINT_MAP[mainVertical]?.[subVertical]) {
    return SUB_VERTICAL_ENDPOINT_MAP[mainVertical][subVertical]();
  }
  // Fall back to main vertical endpoint
  if (ENDPOINT_MAP[mainVertical]) {
    return ENDPOINT_MAP[mainVertical]();
  }
  return '';
};

// Get the appropriate auth token for a vertical/sub-vertical combination
// For Custom vertical with custom agent, use SNOWHOUSE_AUTH_TOKEN
export const getAuthToken = (mainVertical, subVertical, useCustomAgent = false) => {
  // If using custom agent (Custom vertical), use the Snowhouse token
  if (useCustomAgent || mainVertical === 'Custom') {
    return getSnowHouseToken();
  }
  // Try sub-vertical specific token first
  if (subVertical && SUB_VERTICAL_TOKEN_MAP[mainVertical]?.[subVertical]) {
    return SUB_VERTICAL_TOKEN_MAP[mainVertical][subVertical]();
  }
  // Fall back to main vertical token
  if (TOKEN_MAP[mainVertical]) {
    return TOKEN_MAP[mainVertical]();
  }
  return '';
};

// Other API configurations
export const getBrandfetchToken = () => getEnv('BRANDFETCH_TOKEN');
export const getSnowHouseToken = () => getEnv('SNOWHOUSE_AUTH_TOKEN');
export const getRavenAgentEndpoint = () => getEnv('RAVEN_AGENT_ENDPOINT');
export const getSqlStatementEndpoint = () => getEnv('API_ENDPOINT_SQL_STATEMENT');

// Sub-vertical options for each main vertical
export const SUB_VERTICAL_OPTIONS = {
  'Health Services': ['Clinical Trials', 'Genomics'],
  'Financial Services': ['Investment Portfolio Analytics', 'Assets Management Advisor', 'Claims Processor'],
  'Manufacturing': ['Supply Chain Assistant', 'Predictive Maintenance'],
};

// Main vertical options
export const MAIN_VERTICAL_OPTIONS = [
  'Advertising, Media & Entertainment',
  'Custom',
  'Financial Services',
  'Health Services',
  'Manufacturing',
  'Retail',
];

