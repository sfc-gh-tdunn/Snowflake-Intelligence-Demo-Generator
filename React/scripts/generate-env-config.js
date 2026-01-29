#!/usr/bin/env node

/**
 * Generates public/env-config.js from .env file for local development
 * Run: node scripts/generate-env-config.js
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const outputPath = path.join(__dirname, '..', 'public', 'env-config.js');

// Default values
const defaults = {
  BRANDFETCH_TOKEN: '',
  SNOWHOUSE_AUTH_TOKEN: '',
  API_ENDPOINT_RETAIL: '',
  API_ENDPOINT_ADS: '',
  API_ENDPOINT_FIN_INVESTMENT_PORTFOLIO_ANALYTICS: '',
  API_ENDPOINT_FIN_ASSETS_MANAGEMENT_ADVISOR: '',
  API_ENDPOINT_FIN_CLAIMS_PROCESSOR: '',
  API_ENDPOINT_HS_CLINICAL_TRIALS: '',
  API_ENDPOINT_HS_GENOMICS: '',
  API_ENDPOINT_MAN_PREDICTIVE_MAINTENANCE: '',
  API_ENDPOINT_MAN_SUPPLY_CHAIN_ASSISTANT: '',
  API_ENDPOINT_SQL_STATEMENT: '',
  RETAIL_AUTH_TOKEN: '',
  ADS_AUTH_TOKEN: '',
  FIN_INVESTMENT_PORTFOLIO_ANALYTICS_AUTH_TOKEN: '',
  FIN_ASSETS_MANAGEMENT_ADVISOR_AUTH_TOKEN: '',
  FIN_CLAIMS_PROCESSOR_AUTH_TOKEN: '',
  HS_CLINICAL_TRIALS_AUTH_TOKEN: '',
  HS_GENOMICS_AUTH_TOKEN: '',
  MAN_PREDICTIVE_MAINTENANCE_AUTH_TOKEN: '',
  MAN_SUPPLY_CHAIN_ASSISTANT_AUTH_TOKEN: '',
  RAVEN_AGENT_ENDPOINT: 'https://SFCOGSOPS-SNOWHOUSE_AWS_US_WEST_2.snowflakecomputing.com/api/v2/databases/SNOWFLAKE_INTELLIGENCE/schemas/AGENTS/agents/RAVEN_SALES_ASSISTANT:run',
};

// Parse .env file
function parseEnvFile(filePath) {
  const env = { ...defaults };
  
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${filePath} not found. Using defaults.`);
    return env;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    if (key in defaults) {
      env[key] = value;
    }
  }

  return env;
}

// Generate env-config.js content
function generateEnvConfig(env) {
  const entries = Object.entries(env)
    .map(([key, value]) => `  ${key}: "${value}"`)
    .join(',\n');

  return `// Auto-generated from .env - DO NOT EDIT DIRECTLY
// Run: npm run env to regenerate
window.__ENV__ = {
${entries}
};
`;
}

// Main
const env = parseEnvFile(envPath);
const content = generateEnvConfig(env);

fs.writeFileSync(outputPath, content);
console.log(`✅ Generated ${outputPath} from .env`);

// Show which tokens are configured
const configured = Object.entries(env)
  .filter(([_, value]) => value && !value.includes('your_'))
  .map(([key]) => key);

if (configured.length > 0) {
  console.log(`\nConfigured tokens: ${configured.length}`);
  configured.forEach(key => console.log(`  ✓ ${key}`));
} else {
  console.log('\n⚠️  No tokens configured. Edit .env and run again.');
}

