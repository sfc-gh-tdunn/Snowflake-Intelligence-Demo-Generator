-- ============================================
-- Snowflake Intelligence Demo Generator
-- SPCS Deployment Setup Script
-- ============================================

-- Step 1: Set your context
USE ROLE ACCOUNTADMIN;  -- Or your appropriate role with SPCS permissions
USE DATABASE DEMO_GENERATOR;
USE SCHEMA DATA;

-- Step 2: Create Image Repository (if not exists)
CREATE IMAGE REPOSITORY IF NOT EXISTS IMAGE_REPO;

-- Get the repository URL (you'll need this for docker push)
SHOW IMAGE REPOSITORIES;
-- Note the repository_url column - it will look like:
-- <org>-<account>.registry.snowflakecomputing.com/demo_generator/data/image_repo

-- Step 3: Create Compute Pool (if not exists)
CREATE COMPUTE POOL IF NOT EXISTS DEMO_GENERATOR_POOL
  MIN_NODES = 1
  MAX_NODES = 2
  INSTANCE_FAMILY = CPU_X64_XS
  AUTO_RESUME = TRUE
  AUTO_SUSPEND_SECS = 300;

-- Step 4: Create Secrets
-- Secret names MUST match the environment variable names expected by the app
-- Replace the placeholder values with your actual tokens/endpoints

-- Brandfetch API Token
CREATE OR REPLACE SECRET BRANDFETCH_TOKEN
  TYPE = GENERIC_STRING
  SECRET_STRING = 'YOUR_BRANDFETCH_TOKEN';

-- Raven Agent Endpoint
CREATE OR REPLACE SECRET RAVEN_AGENT_ENDPOINT
  TYPE = GENERIC_STRING
  SECRET_STRING = 'https://YOUR_ACCOUNT.snowflakecomputing.com/api/v2/databases/SNOWFLAKE_INTELLIGENCE/schemas/AGENTS/agents/RAVEN_SALES_ASSISTANT:run';

-- ===== RETAIL =====
CREATE OR REPLACE SECRET API_ENDPOINT_RETAIL
  TYPE = GENERIC_STRING
  SECRET_STRING = 'https://YOUR_ACCOUNT.snowflakecomputing.com/api/v2/cortex/agent:run';

CREATE OR REPLACE SECRET RETAIL_AUTH_TOKEN
  TYPE = GENERIC_STRING
  SECRET_STRING = 'YOUR_RETAIL_AUTH_TOKEN';

-- ===== ADVERTISING =====
CREATE OR REPLACE SECRET API_ENDPOINT_ADS
  TYPE = GENERIC_STRING
  SECRET_STRING = 'https://YOUR_ACCOUNT.snowflakecomputing.com/api/v2/cortex/agent:run';

CREATE OR REPLACE SECRET ADS_AUTH_TOKEN
  TYPE = GENERIC_STRING
  SECRET_STRING = 'YOUR_ADS_AUTH_TOKEN';

-- ===== FINANCIAL SERVICES - Investment Portfolio =====
CREATE OR REPLACE SECRET API_ENDPOINT_FIN_INVESTMENT_PORTFOLIO_ANALYTICS
  TYPE = GENERIC_STRING
  SECRET_STRING = 'https://YOUR_ACCOUNT.snowflakecomputing.com/api/v2/cortex/agent:run';

CREATE OR REPLACE SECRET FIN_INVESTMENT_PORTFOLIO_ANALYTICS_AUTH_TOKEN
  TYPE = GENERIC_STRING
  SECRET_STRING = 'YOUR_FIN_INVESTMENT_AUTH_TOKEN';

-- ===== FINANCIAL SERVICES - Assets Management =====
CREATE OR REPLACE SECRET API_ENDPOINT_FIN_ASSETS_MANAGEMENT_ADVISOR
  TYPE = GENERIC_STRING
  SECRET_STRING = 'https://YOUR_ACCOUNT.snowflakecomputing.com/api/v2/cortex/agent:run';

CREATE OR REPLACE SECRET FIN_ASSETS_MANAGEMENT_ADVISOR_AUTH_TOKEN
  TYPE = GENERIC_STRING
  SECRET_STRING = 'YOUR_FIN_ASSETS_AUTH_TOKEN';

-- ===== FINANCIAL SERVICES - Claims Processor =====
CREATE OR REPLACE SECRET API_ENDPOINT_FIN_CLAIMS_PROCESSOR
  TYPE = GENERIC_STRING
  SECRET_STRING = 'https://YOUR_ACCOUNT.snowflakecomputing.com/api/v2/cortex/agent:run';

CREATE OR REPLACE SECRET FIN_CLAIMS_PROCESSOR_AUTH_TOKEN
  TYPE = GENERIC_STRING
  SECRET_STRING = 'YOUR_FIN_CLAIMS_AUTH_TOKEN';

-- ===== HEALTHCARE - Clinical Trials =====
CREATE OR REPLACE SECRET API_ENDPOINT_HS_CLINICAL_TRIALS
  TYPE = GENERIC_STRING
  SECRET_STRING = 'https://YOUR_ACCOUNT.snowflakecomputing.com/api/v2/cortex/agent:run';

CREATE OR REPLACE SECRET HS_CLINICAL_TRIALS_AUTH_TOKEN
  TYPE = GENERIC_STRING
  SECRET_STRING = 'YOUR_HS_CLINICAL_AUTH_TOKEN';

-- ===== HEALTHCARE - Genomics =====
CREATE OR REPLACE SECRET API_ENDPOINT_HS_GENOMICS
  TYPE = GENERIC_STRING
  SECRET_STRING = 'https://YOUR_ACCOUNT.snowflakecomputing.com/api/v2/cortex/agent:run';

CREATE OR REPLACE SECRET HS_GENOMICS_AUTH_TOKEN
  TYPE = GENERIC_STRING
  SECRET_STRING = 'YOUR_HS_GENOMICS_AUTH_TOKEN';

-- ===== MANUFACTURING - Predictive Maintenance =====
CREATE OR REPLACE SECRET API_ENDPOINT_MAN_PREDICTIVE_MAINTENANCE
  TYPE = GENERIC_STRING
  SECRET_STRING = 'https://YOUR_ACCOUNT.snowflakecomputing.com/api/v2/cortex/agent:run';

CREATE OR REPLACE SECRET MAN_PREDICTIVE_MAINTENANCE_AUTH_TOKEN
  TYPE = GENERIC_STRING
  SECRET_STRING = 'YOUR_MAN_PREDICTIVE_AUTH_TOKEN';

-- ===== MANUFACTURING - Supply Chain =====
CREATE OR REPLACE SECRET API_ENDPOINT_MAN_SUPPLY_CHAIN_ASSISTANT
  TYPE = GENERIC_STRING
  SECRET_STRING = 'https://YOUR_ACCOUNT.snowflakecomputing.com/api/v2/cortex/agent:run';

CREATE OR REPLACE SECRET MAN_SUPPLY_CHAIN_ASSISTANT_AUTH_TOKEN
  TYPE = GENERIC_STRING
  SECRET_STRING = 'YOUR_MAN_SUPPLY_AUTH_TOKEN';

-- Step 5: Create the service specification stage
CREATE STAGE IF NOT EXISTS SPECS
  ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE');

-- Upload service-spec.yaml to this stage using:
-- PUT file://./snowflake/service-spec.yaml @SPECS AUTO_COMPRESS=FALSE OVERWRITE=TRUE;

-- Step 6: Create Network Rules for external access

-- Brandfetch API
CREATE OR REPLACE NETWORK RULE brandfetch_network_rule
  MODE = EGRESS
  TYPE = HOST_PORT
  VALUE_LIST = ('api.brandfetch.io:443');

-- Snowflake Agent APIs (add your specific account hostnames)
-- Replace YOUR_ACCOUNT with your actual Snowflake account identifier
CREATE OR REPLACE NETWORK RULE snowflake_api_network_rule
  MODE = EGRESS
  TYPE = HOST_PORT
  VALUE_LIST = (
    '*.snowflakecomputing.com:443',
    '*.snowflake.com:443'
  );

-- Step 7: Create External Access Integration (includes all network rules)
CREATE OR REPLACE EXTERNAL ACCESS INTEGRATION demo_generator_external_access
  ALLOWED_NETWORK_RULES = (brandfetch_network_rule, snowflake_api_network_rule)
  ENABLED = TRUE;

-- Step 8: Create the Service
-- Note: Run this AFTER uploading service-spec.yaml to the SPECS stage
CREATE SERVICE IF NOT EXISTS DEMO_GENERATOR_SERVICE
  IN COMPUTE POOL DEMO_GENERATOR_POOL
  FROM @SPECS
  SPECIFICATION_FILE = 'service-spec.yaml'
  EXTERNAL_ACCESS_INTEGRATIONS = (demo_generator_external_access);

-- Step 9: Check service status
DESCRIBE SERVICE DEMO_GENERATOR_SERVICE;
CALL SYSTEM$GET_SERVICE_STATUS('DEMO_GENERATOR_SERVICE');
CALL SYSTEM$GET_SERVICE_LOGS('DEMO_GENERATOR_SERVICE', 0, 'snowflake-demo-generator');

-- Step 10: Get the public endpoint URL
SHOW ENDPOINTS IN SERVICE DEMO_GENERATOR_SERVICE;
-- The ingress_url column contains your public URL

-- ============================================
-- Useful Commands
-- ============================================

-- Restart service after updates:
-- ALTER SERVICE DEMO_GENERATOR_SERVICE SUSPEND;
-- ALTER SERVICE DEMO_GENERATOR_SERVICE RESUME;

-- Update service with new image:
-- ALTER SERVICE DEMO_GENERATOR_SERVICE 
--   FROM @SPECS SPECIFICATION_FILE = 'service-spec.yaml';

-- Delete service:
-- DROP SERVICE DEMO_GENERATOR_SERVICE;

-- Check compute pool status:
-- DESCRIBE COMPUTE POOL DEMO_GENERATOR_POOL;
