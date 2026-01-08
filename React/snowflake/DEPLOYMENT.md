# Deploying to Snowpark Container Services (SPCS)

This guide walks through deploying the Snowflake Intelligence Demo Generator to SPCS.

## Prerequisites

- Snowflake account with SPCS enabled
- Docker installed locally
- SnowSQL or Snowflake UI access
- Appropriate role with SPCS permissions

## Step 1: Build the Docker Image

```bash
cd /path/to/React
docker build -t snowflake-demo-generator:latest .
```

## Step 2: Get Your Image Repository URL

Run in Snowflake:
```sql
USE DATABASE DEMO_GENERATOR;
USE SCHEMA DATA;
SHOW IMAGE REPOSITORIES;
```

Note the `repository_url` - it looks like:
```
<org>-<account>.registry.snowflakecomputing.com/demo_generator/data/image_repo
```

## Step 3: Authenticate Docker with Snowflake

```bash
# Login to Snowflake container registry
docker login <org>-<account>.registry.snowflakecomputing.com -u <username>
# Enter your Snowflake password when prompted
```

## Step 4: Tag and Push the Image

```bash
# Tag the image
docker tag snowflake-demo-generator:latest \
  <org>-<account>.registry.snowflakecomputing.com/demo_generator/data/image_repo/snowflake-demo-generator:latest

# Push to Snowflake
docker push <org>-<account>.registry.snowflakecomputing.com/demo_generator/data/image_repo/snowflake-demo-generator:latest
```

## Step 5: Update Secrets in setup.sql

Edit `snowflake/setup.sql` and replace all placeholder values:
- `YOUR_BRANDFETCH_TOKEN`
- `YOUR_RETAIL_AUTH_TOKEN`
- All other `YOUR_*` placeholders

## Step 6: Run the Setup Script

Execute the SQL in `snowflake/setup.sql` in Snowflake (via SnowSQL or UI).

This will:
1. Create the image repository
2. Create the compute pool
3. Create all secrets
4. Create network rules for external API access

## Step 7: Upload Service Spec

```bash
# Using SnowSQL
snowsql -q "PUT file://./snowflake/service-spec.yaml @DEMO_GENERATOR.DATA.SPECS AUTO_COMPRESS=FALSE OVERWRITE=TRUE"
```

Or via Snowflake UI:
1. Go to Data → Databases → DEMO_GENERATOR → DATA → Stages → SPECS
2. Upload `service-spec.yaml`

## Step 8: Create the Service

```sql
CREATE SERVICE DEMO_GENERATOR_SERVICE
  IN COMPUTE POOL DEMO_GENERATOR_POOL
  FROM @SPECS
  SPECIFICATION_FILE = 'service-spec.yaml'
  EXTERNAL_ACCESS_INTEGRATIONS = (brandfetch_access_integration);
```

## Step 9: Get Your App URL

```sql
SHOW ENDPOINTS IN SERVICE DEMO_GENERATOR_SERVICE;
```

The `ingress_url` column contains your public URL!

## Troubleshooting

### Check Service Status
```sql
CALL SYSTEM$GET_SERVICE_STATUS('DEMO_GENERATOR_SERVICE');
```

### View Container Logs
```sql
CALL SYSTEM$GET_SERVICE_LOGS('DEMO_GENERATOR_SERVICE', 0, 'snowflake-demo-generator');
```

### Restart Service
```sql
ALTER SERVICE DEMO_GENERATOR_SERVICE SUSPEND;
ALTER SERVICE DEMO_GENERATOR_SERVICE RESUME;
```

### Update Image
After pushing a new image:
```sql
ALTER SERVICE DEMO_GENERATOR_SERVICE 
  FROM @SPECS SPECIFICATION_FILE = 'service-spec.yaml';
```

## Environment Variables

All environment variables are injected at runtime from Snowflake Secrets. The `docker-entrypoint.sh` script generates `/usr/share/nginx/html/env-config.js` with these values when the container starts.

| Variable | Secret Name | Description |
|----------|-------------|-------------|
| BRANDFETCH_TOKEN | brandfetch_token | API key for Brandfetch |
| RAVEN_AGENT_ENDPOINT | raven_agent_endpoint | Raven sales assistant endpoint |
| API_ENDPOINT_RETAIL | api_endpoint_retail | Retail agent endpoint |
| RETAIL_AUTH_TOKEN | retail_auth_token | Retail agent auth token |
| ... | ... | (see setup.sql for full list) |

