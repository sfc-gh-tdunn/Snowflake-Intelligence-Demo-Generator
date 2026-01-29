/**
 * Snowflake SQL Statement Service
 * Refactored to match data_generator_original.py workflow
 * 
 * Creates:
 * - 2 structured tables with ENTITY_ID join key (70% overlap)
 * - 1 unstructured chunks table for Cortex Search
 * - 1 semantic view with facts, dimensions, and CA extension
 * - 1 Cortex Search service
 * - 1 Snowflake Agent
 */

import { getSnowHouseToken, getRavenAgentEndpoint } from '../config/endpoints';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  database: 'TEMP',
  schema: 'TDUNN',
  warehouse: 'SNOWHOUSE',
  role: 'SALES_ENGINEER',
  llmModel: 'claude-4-sonnet',
  pollIntervalMs: 3000,
  maxPollAttempts: 60,
  // Hardcoded SQL Statement API endpoint
  sqlStatementEndpoint: 'https://sfcogsops-snowhouse_aws_us_west_2.snowflakecomputing.com/api/v2/statements',
};

const AGENT_CONFIG = {
  orchestrationModel: 'claude-4-sonnet',
  budgetSeconds: 120,
  budgetTokens: 4096,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract clean company name from URL
 */
export const extractCompanyName = (url) => {
  if (!url) return 'company';
  let cleanUrl = url
    .trim()                        // Remove leading/trailing whitespace
    .toLowerCase()
    .replace(/^https?:\/\//, '')   // Remove protocol
    .replace(/^www\./, '')         // Remove www. prefix
    .split('/')[0]                 // Remove path
    .split('.')[0];                // Get domain name (first part)
  // Replace hyphens with underscores for SQL compatibility
  return cleanUrl.replace(/-/g, '_');
};

/**
 * Generate timestamp string for unique naming
 */
export const generateTimestamp = () => {
  const now = new Date();
  return now.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .slice(0, 15);
};

/**
 * Random integer between min and max (inclusive)
 */
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Random float between min and max with decimals
 */
const randomFloat = (min, max, decimals = 2) => 
  parseFloat((Math.random() * (max - min) + min).toFixed(decimals));

/**
 * Random date within the past N days
 */
const randomDate = (daysBack = 365) => {
  const date = new Date();
  date.setDate(date.getDate() - randomInt(1, daysBack));
  return date.toISOString().split('T')[0];
};

/**
 * Random timestamp within the past N days
 */
const randomTimestamp = (daysBack = 365) => {
  const date = new Date();
  date.setDate(date.getDate() - randomInt(1, daysBack));
  date.setHours(randomInt(0, 23), randomInt(0, 59), randomInt(0, 59));
  return date.toISOString().replace('T', ' ').slice(0, 19);
};

/**
 * Random time (HH:MM:SS format)
 */
const randomTime = () => {
  const hours = String(randomInt(0, 23)).padStart(2, '0');
  const minutes = String(randomInt(0, 59)).padStart(2, '0');
  const seconds = String(randomInt(0, 59)).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

/**
 * Random choice from array
 */
const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Escape SQL string values
 */
const escapeSql = (str) => {
  if (str === null || str === undefined) return 'NULL';
  if (typeof str !== 'string') return String(str);
  return str.replace(/'/g, "''");
};

// ============================================================================
// API EXECUTION FUNCTIONS
// ============================================================================

/**
 * Get the base URL from the SQL Statement endpoint
 */
const getSnowflakeBaseUrl = () => {
  const endpoint = CONFIG.sqlStatementEndpoint;
  // Extract base URL (e.g., https://sfcogsops-snowhouse_aws_us_west_2.snowflakecomputing.com)
  const url = new URL(endpoint);
  return `${url.protocol}//${url.host}`;
};

/**
 * Poll for query completion
 */
const pollForCompletion = async (statusUrl) => {
  const token = getSnowHouseToken();
  const baseUrl = getSnowflakeBaseUrl();
  
  // Construct full URL if statusUrl is relative
  const fullStatusUrl = statusUrl.startsWith('http') ? statusUrl : `${baseUrl}${statusUrl}`;
  
  for (let attempt = 0; attempt < CONFIG.maxPollAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, CONFIG.pollIntervalMs));
    
    const statusResponse = await fetch(fullStatusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    const statusData = await statusResponse.json();
    
    if (statusData.message === 'Statement executed successfully.') {
      return statusData;
    }
    
    if (statusData.message && statusData.message.includes('error')) {
      throw new Error(statusData.message);
    }
  }
  
  throw new Error('Query timed out waiting for completion');
};

/**
 * Count SQL statements in a script
 */
const countStatements = (sql) => {
  const statements = sql.split(';').filter(s => s.trim().length > 0);
  return statements.length;
};

/**
 * Execute SQL statement via Snowflake API
 */
const executeSqlStatement = async (statement, isMultiStatement = false) => {
  const endpoint = CONFIG.sqlStatementEndpoint;
  const token = getSnowHouseToken();
  
  const requestBody = {
    statement,
    database: CONFIG.database,
    schema: CONFIG.schema,
    warehouse: CONFIG.warehouse,
    role: CONFIG.role,
  };
  
  if (isMultiStatement) {
    requestBody.parameters = {
      MULTI_STATEMENT_COUNT: String(countStatements(statement)),
    };
  }
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || `API error: ${response.status}`);
  }
  
  // Handle async query - poll for completion
  if (data.statementStatusUrl) {
    return await pollForCompletion(data.statementStatusUrl);
  }
  
  return data;
};

/**
 * Log demo usage to Snowflake tracking table
 * @param {Object} params - Usage data
 * @param {string} params.name - User's name
 * @param {string} params.companyUrl - Company URL
 * @param {string} params.vertical - Main vertical
 * @param {string} params.subVertical - Sub-vertical (optional)
 */
export const logDemoUsage = async ({ name, companyUrl, vertical, subVertical }) => {
  const companyName = extractCompanyName(companyUrl);
  
  const insertSql = `
    INSERT INTO TEMP.TDUNN.si_demo_usage (name, company_name, vertical, sub_vertical, company_url)
    VALUES ('${escapeSql(name)}', '${escapeSql(companyName)}', '${escapeSql(vertical)}', '${escapeSql(subVertical || '')}', '${escapeSql(companyUrl)}')
  `;
  
  try {
    await executeSqlStatement(insertSql);
    console.log('Demo usage logged successfully');
  } catch (error) {
    // Log error but don't block the user flow
    console.error('Failed to log demo usage:', error);
  }
};

/**
 * Unescape a string that may have escaped characters
 */
const unescapeString = (str) => {
  if (typeof str !== 'string') return str;
  
  // If the string is wrapped in quotes (JSON string), parse it first
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    try {
      str = JSON.parse(str);
    } catch (e) {
      // Remove outer quotes manually if JSON.parse fails
      str = str.slice(1, -1);
    }
  }
  
  // Unescape common escape sequences
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
};

/**
 * Extract JSON from LLM response
 */
const extractJsonFromResponse = (response, type = 'object') => {
  if (!response) return null;
  
  // Handle response structure from Snowflake API
  let text = response;
  if (response.data && Array.isArray(response.data) && response.data[0]) {
    text = response.data[0][0];
  }
  
  if (typeof text !== 'string') {
    text = JSON.stringify(text);
  }
  
  // Unescape the string (AI_COMPLETE responses often come escaped)
  text = unescapeString(text);
  
  // Try to extract JSON
  const pattern = type === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = text.match(pattern);
  
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      console.error('JSON parse error:', e);
      console.error('Attempted to parse:', match[0].substring(0, 200));
      return null;
    }
  }
  
  return null;
};

// ============================================================================
// RAVEN API INTEGRATION
// ============================================================================

/**
 * Call Raven API to generate table schemas based on company and use cases
 */
const generateTableSchemasWithRaven = async (companyUrl, useCases, companyName) => {
  const endpoint = getRavenAgentEndpoint();
  const token = getSnowHouseToken();
  
  if (!endpoint || !token) {
    throw new Error('Raven Agent endpoint or token not configured');
  }
  
  const prompt = `Please review this company's URL ${companyUrl} and identify their main industry, goal, and any recent major news. With this company profile, use the input use cases "${useCases || 'Not specified'}" (if there no input use cases, generate 1 of your own Snowflake Intelligence uses cases for this company. Make sure you focus on an initial foundational Snowflake Intelligence use case that could be addressed based on three data sources) and create three data sources: 2 structured tables and 1 unstructured table schemas with descriptions. 

Make sure the table schemas and descriptions are contextually relevant to the use case and company information. There will be a common join field in all the data called ENTITY_ID, and there will be 70% overlap for joins.

Requirements:
- Table names should be SQL-friendly (UPPERCASE, underscores, no spaces)
- Table names should be prefixed with "${companyName.toUpperCase()}_"
- Each structured table should have 6-10 business-relevant columns
- The unstructured table should store text chunks for semantic search

Return ONLY a JSON object with this exact structure (no other text before or after):
{
  "structured_1": {
    "name": "${companyName.toUpperCase()}_TABLE_NAME_1",
    "description": "What this table contains and its purpose",
    "columns": [
      {"name": "ENTITY_ID", "type": "NUMBER", "description": "Unique identifier for joining tables"},
      {"name": "COLUMN_NAME", "type": "DATA_TYPE", "description": "Column description", "sample_values": ["val1", "val2", "val3"]}
    ]
  },
  "structured_2": {
    "name": "${companyName.toUpperCase()}_TABLE_NAME_2",
    "description": "What this table contains and its purpose",
    "columns": [
      {"name": "ENTITY_ID", "type": "NUMBER", "description": "Unique identifier for joining tables"},
      {"name": "COLUMN_NAME", "type": "DATA_TYPE", "description": "Column description", "sample_values": ["val1", "val2", "val3"]}
    ]
  },
  "unstructured": {
    "name": "${companyName.toUpperCase()}_CHUNKS",
    "description": "Chunked text data for semantic search",
    "content_type": "Description of what kind of text content this contains"
  }
}`;

  const payload = {
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
    tool_choice: {
      type: 'auto',
      name: [],
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Raven API error: ${response.status}`);
  }

  // Process streaming response
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let responseText = '';
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim();
        continue;
      }

      if (line.startsWith('data:') && currentEvent === 'response.text') {
        try {
          const data = JSON.parse(line.slice(5).trim());
          if (data.text) {
            responseText += data.text;
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }

  // Extract JSON from response
  const schemas = extractJsonFromResponse(responseText);
  
  if (!schemas) {
    console.error('Raven response:', responseText);
    throw new Error('Failed to parse table schemas from Raven response');
  }
  
  return schemas;
};

// ============================================================================
// SCHEMA & DATA GENERATION
// ============================================================================

/**
 * Generate realistic data based on LLM-provided schema
 */
const generateDataFromSchema = (schema, numRecords, entityIds) => {
  const data = [];
  
  for (let i = 0; i < numRecords; i++) {
    const record = {};
    
    for (const col of schema.columns) {
      const colName = col.name;
      const colType = col.type.toUpperCase();
      const sampleValues = col.sample_values || [];
      
      // Handle ENTITY_ID specially
      if (colName === 'ENTITY_ID') {
        record[colName] = entityIds[i];
        continue;
      }
      
      // Generate values based on type and samples
      if (['STRING', 'VARCHAR', 'TEXT'].includes(colType)) {
        if (sampleValues.length > 0) {
          record[colName] = randomChoice(sampleValues);
        } else {
          record[colName] = `Sample_${i + 1}`;
        }
      } else if (['NUMBER', 'INTEGER', 'INT'].includes(colType)) {
        if (colName.includes('ID') && colName !== 'ENTITY_ID') {
          record[colName] = i + 1;
        } else if (sampleValues.length > 0) {
          const numVals = sampleValues.filter(v => !isNaN(parseInt(v)));
          record[colName] = numVals.length > 0 ? parseInt(randomChoice(numVals)) : randomInt(1, 1000);
        } else {
          record[colName] = randomInt(1, 1000);
        }
      } else if (['FLOAT', 'DECIMAL', 'DOUBLE'].includes(colType)) {
        if (sampleValues.length > 0) {
          record[colName] = parseFloat(randomChoice(sampleValues));
        } else {
          record[colName] = randomFloat(0, 1000);
        }
      } else if (colType === 'DATE') {
        record[colName] = randomDate();
      } else if (['TIMESTAMP', 'DATETIME', 'TIMESTAMP_NTZ', 'TIMESTAMP_LTZ', 'TIMESTAMP_TZ'].includes(colType)) {
        record[colName] = randomTimestamp();
      } else if (colType === 'TIME') {
        record[colName] = randomTime();
      } else if (colType === 'BOOLEAN') {
        record[colName] = randomChoice([true, false]);
      } else {
        // Default - check if column name suggests a specific type
        const upperColName = colName.toUpperCase();
        if (upperColName.includes('TIME') && !upperColName.includes('TIMESTAMP')) {
          record[colName] = randomTime();
        } else if (upperColName.includes('DATE')) {
          record[colName] = randomDate();
        } else {
          record[colName] = sampleValues.length > 0 ? randomChoice(sampleValues) : `Value_${i + 1}`;
        }
      }
    }
    
    data.push(record);
  }
  
  return data;
};

/**
 * Generate unstructured text content using LLM
 */
const generateUnstructuredContent = async (tableInfo, numSamples, companyName) => {
  const cappedSamples = Math.min(numSamples, 50); // Cap to avoid token limits
  
  const prompt = `You are creating realistic unstructured text content for a Snowflake Cortex Search demo.

Table Information:
- Name: ${tableInfo.name}
- Description: ${tableInfo.description}
- Content Type: ${tableInfo.content_type}
- Company: ${companyName}

Generate ${cappedSamples} different realistic text samples that would be found in this type of data. Each should be 2-4 sentences long and relevant to the business context.

Examples should be:
- Realistic business content
- Varied in tone and style
- Relevant to the table's purpose
- Appropriate for semantic search
- Professional but natural

Return ONLY a JSON array of text strings:
["text sample 1", "text sample 2", ...]`;

  const sql = `SELECT AI_COMPLETE('${CONFIG.llmModel}', '${escapeSql(prompt)}') as response`;
  
  const response = await executeSqlStatement(sql);
  const textSamples = extractJsonFromResponse(response, 'array');
  
  if (!textSamples || textSamples.length === 0) {
    throw new Error('Failed to generate unstructured content');
  }
  
  return textSamples;
};

/**
 * Generate chunked data from text samples (matching original Python structure)
 */
const generateChunkedDataFromSamples = (textSamples, numRecords, tableInfo, companyName) => {
  const data = [];
  let chunkId = 1;
  
  for (let i = 0; i < numRecords; i++) {
    // Select a random text sample
    const fullText = randomChoice(textSamples);
    
    // Split into chunks (simulate document chunking)
    const sentences = fullText.split('. ');
    
    // Create chunks of 1-2 sentences each
    const chunkSize = randomInt(1, 2);
    for (let j = 0; j < sentences.length; j += chunkSize) {
      const chunkSentences = sentences.slice(j, j + chunkSize);
      let chunkText = chunkSentences.join('. ');
      if (chunkText && !chunkText.endsWith('.')) {
        chunkText += '.';
      }
      
      if (chunkText.trim()) {
        data.push({
          CHUNK_ID: `CHUNK_${String(chunkId).padStart(8, '0')}`,
          DOCUMENT_ID: `DOC_${String(i + 1).padStart(6, '0')}`,
          ENTITY_ID: i + 1, // For joining with structured tables
          CHUNK_TEXT: chunkText.trim(),
          CHUNK_POSITION: Math.floor(j / chunkSize) + 1,
          CHUNK_LENGTH: chunkText.length,
          DOCUMENT_TYPE: tableInfo.name.replace('_CHUNKS', '').toLowerCase(),
          SOURCE_SYSTEM: companyName.replace(/-/g, '_').toUpperCase(),
          CREATED_DATE: randomDate(),
          LAST_MODIFIED: randomTimestamp(30),
          METADATA: JSON.stringify({
            source_table: tableInfo.name,
            chunk_method: 'sentence_boundary',
            language: 'en',
            confidence_score: randomFloat(0.7, 1.0),
          }),
        });
        chunkId++;
      }
    }
  }
  
  return data;
};

// ============================================================================
// TABLE CREATION
// ============================================================================

/**
 * Build CREATE TABLE SQL for structured data
 */
const buildStructuredCreateTableSql = (tableName, columns) => {
  const columnDefs = columns.map(col => {
    let typeDef = col.type.toUpperCase();
    if (col.name === 'ENTITY_ID') {
      return `${col.name} NUMBER PRIMARY KEY`;
    }
    return `${col.name} ${typeDef}`;
  }).join(',\n  ');
  
  return `CREATE OR REPLACE TABLE ${CONFIG.database}.${CONFIG.schema}.${tableName} (
  ${columnDefs}
)`;
};

/**
 * Build CREATE TABLE SQL for unstructured chunks data
 */
const buildUnstructuredCreateTableSql = (tableName) => {
  return `CREATE OR REPLACE TABLE ${CONFIG.database}.${CONFIG.schema}.${tableName} (
  CHUNK_ID VARCHAR(50) PRIMARY KEY,
  DOCUMENT_ID VARCHAR(50) NOT NULL,
  ENTITY_ID NUMBER,
  CHUNK_TEXT TEXT NOT NULL,
  CHUNK_POSITION NUMBER,
  CHUNK_LENGTH NUMBER,
  DOCUMENT_TYPE VARCHAR(100),
  SOURCE_SYSTEM VARCHAR(100),
  CREATED_DATE DATE,
  LAST_MODIFIED TIMESTAMP,
  METADATA VARIANT
)`;
};

/**
 * Build INSERT SQL for structured data
 */
const buildStructuredInsertSql = (tableName, columns, data) => {
  if (data.length === 0) return '';
  
  const columnNames = columns.map(c => c.name).join(', ');
  const batchSize = 100;
  const statements = [];
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const values = batch.map(row => {
      const rowValues = columns.map(col => {
        const val = row[col.name];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        if (typeof val === 'number') return val;
        if (typeof val === 'string') return `'${escapeSql(val)}'`;
        return `'${escapeSql(String(val))}'`;
      });
      return `(${rowValues.join(', ')})`;
    }).join(',\n');
    
    statements.push(`INSERT INTO ${CONFIG.database}.${CONFIG.schema}.${tableName} (${columnNames}) VALUES\n${values}`);
  }
  
  return statements.join(';\n');
};

/**
 * Build INSERT SQL for unstructured chunks data
 * Uses INSERT ... SELECT to allow PARSE_JSON function (not allowed in VALUES clause)
 */
const buildUnstructuredInsertSql = (tableName, data) => {
  if (data.length === 0) return '';
  
  const columns = ['CHUNK_ID', 'DOCUMENT_ID', 'ENTITY_ID', 'CHUNK_TEXT', 'CHUNK_POSITION', 
                   'CHUNK_LENGTH', 'DOCUMENT_TYPE', 'SOURCE_SYSTEM', 'CREATED_DATE', 
                   'LAST_MODIFIED', 'METADATA'];
  
  const batchSize = 50;
  const statements = [];
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    // Use INSERT ... SELECT with UNION ALL to allow PARSE_JSON
    const selects = batch.map(row => {
      return `SELECT '${escapeSql(row.CHUNK_ID)}', '${escapeSql(row.DOCUMENT_ID)}', ${row.ENTITY_ID}, '${escapeSql(row.CHUNK_TEXT)}', ${row.CHUNK_POSITION}, ${row.CHUNK_LENGTH}, '${escapeSql(row.DOCUMENT_TYPE)}', '${escapeSql(row.SOURCE_SYSTEM)}', '${row.CREATED_DATE}'::DATE, '${row.LAST_MODIFIED}'::TIMESTAMP, PARSE_JSON('${escapeSql(row.METADATA)}')`;
    }).join('\nUNION ALL\n');
    
    statements.push(`INSERT INTO ${CONFIG.database}.${CONFIG.schema}.${tableName} (${columns.join(', ')})\n${selects}`);
  }
  
  return statements.join(';\n');
};

// ============================================================================
// SEMANTIC VIEW CREATION
// ============================================================================

/**
 * Get table schema from Snowflake
 */
const getTableSchemaFromSnowflake = async (tableName) => {
  const sql = `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = '${CONFIG.schema}' AND TABLE_NAME = '${tableName.toUpperCase()}'
               ORDER BY ORDINAL_POSITION`;
  
  try {
    const response = await executeSqlStatement(sql);
    if (response.data && response.data.length > 0) {
      return response.data.map(row => ({
        name: row[0],
        type: row[1],
      }));
    }
  } catch (e) {
    console.error('Error fetching table schema:', e);
  }
  return [];
};

/**
 * Generate semantic elements (facts, dimensions) using LLM
 */
const generateSemanticElements = async (table1Name, table1Schema, table2Name, table2Schema, companyName, useCases) => {
  const prompt = `You are creating a comprehensive Snowflake semantic view for a demo. Generate facts, dimensions, synonyms, comments.

Demo Context:
- Company: ${companyName}
- Use Cases: ${useCases || 'General business analytics'}
- Table 1: ${table1Name} with columns: ${JSON.stringify(table1Schema.map(c => `${c.name} (${c.type})`))}
- Table 2: ${table2Name} with columns: ${JSON.stringify(table2Schema.map(c => `${c.name} (${c.type})`))}

Generate semantic view elements with this structure:

FACTS: Numeric/measurable columns (NUMBER, FLOAT, INTEGER types)
DIMENSIONS: Categorical/descriptive columns (VARCHAR, DATE, BOOLEAN types)

For each fact/dimension, provide:
- Meaningful synonyms (5-8 alternatives using underscores instead of spaces)
- Business-relevant comment
- Table.column reference (use just TABLE_NAME.COLUMN_NAME)
- IMPORTANT: The "name" field should be the same as the COLUMN_NAME (not a different semantic name)
- IMPORTANT: Always include ENTITY_ID from each table as a fact

Return ONLY a JSON object with this structure:
{
  "facts": [
    {
      "table_column": "TABLE_NAME.COLUMN_NAME",
      "name": "COLUMN_NAME",
      "synonyms": ["synonym_1", "synonym_2", "synonym_3", "synonym_4", "synonym_5"],
      "comment": "Business description of what this represents"
    }
  ],
  "dimensions": [
    {
      "table_column": "TABLE_NAME.COLUMN_NAME", 
      "name": "COLUMN_NAME",
      "synonyms": ["synonym_1", "synonym_2", "synonym_3", "synonym_4", "synonym_5"],
      "comment": "Business description of what this represents"
    }
  ],
  "sample_queries": [
    "What are the top performing categories by revenue?",
    "Show me trends over the last quarter",
    "Which segments have the highest conversion rates?"
  ]
}`;

  const sql = `SELECT AI_COMPLETE('${CONFIG.llmModel}', '${escapeSql(prompt)}') as response`;
  
  const response = await executeSqlStatement(sql);
  const elements = extractJsonFromResponse(response);
  
  if (!elements) {
    throw new Error('Failed to generate semantic elements');
  }
  
  return elements;
};

/**
 * Build FACTS SQL for semantic view
 */
const buildFactsSql = (facts) => {
  return facts.map((fact, i) => {
    const synonymsClean = fact.synonyms.map(s => s.replace(/\s+/g, '_').replace(/-/g, '_'));
    const synonymsStr = synonymsClean.map(s => `'${s}'`).join(',');
    const comment = fact.comment.replace(/'/g, "''");
    const comma = i < facts.length - 1 ? ',' : '';
    return `    ${fact.table_column} as ${fact.name} with synonyms=(${synonymsStr}) comment='${comment}'${comma}`;
  }).join('\n');
};

/**
 * Build DIMENSIONS SQL for semantic view
 */
const buildDimensionsSql = (dimensions) => {
  return dimensions.map((dim, i) => {
    const synonymsClean = dim.synonyms.map(s => s.replace(/\s+/g, '_').replace(/-/g, '_'));
    const synonymsStr = synonymsClean.map(s => `'${s}'`).join(',');
    const comment = dim.comment.replace(/'/g, "''");
    const comma = i < dimensions.length - 1 ? ',' : '';
    return `    ${dim.table_column} as ${dim.name} with synonyms=(${synonymsStr}) comment='${comment}'${comma}`;
  }).join('\n');
};

/**
 * Generate CA Extension JSON
 */
const generateCaExtension = (table1Name, table1Schema, table2Name, table2Schema, semanticElements) => {
  // Helper to get sample values based on column type
  const getSampleValues = (colName, colType) => {
    const upperName = colName.toUpperCase();
    
    if (['NUMBER', 'INTEGER', 'FLOAT', 'DECIMAL'].includes(colType)) {
      if (upperName.includes('ID')) {
        return [String(randomInt(1, 200)), String(randomInt(1, 200)), String(randomInt(1, 200))];
      } else if (upperName.includes('COST') || upperName.includes('PRICE') || upperName.includes('REVENUE') || upperName.includes('AMOUNT')) {
        return [String(randomFloat(100, 5000)), String(randomFloat(100, 5000)), String(randomFloat(100, 5000))];
      } else if (upperName.includes('PERCENTAGE') || upperName.includes('RATE')) {
        return [String(randomFloat(0, 100, 1)), String(randomFloat(0, 100, 1)), String(randomFloat(0, 100, 1))];
      }
      return [String(randomFloat(1, 1000)), String(randomFloat(1, 1000)), String(randomFloat(1, 1000))];
    } else if (['VARCHAR', 'STRING', 'TEXT'].includes(colType)) {
      if (upperName.includes('ID')) {
        return [`ID_${randomInt(1000, 9999)}`, `ID_${randomInt(1000, 9999)}`, `ID_${randomInt(1000, 9999)}`];
      } else if (upperName.includes('NAME')) {
        return ['Alpha', 'Beta', 'Gamma'];
      } else if (upperName.includes('STATUS')) {
        return ['Active', 'Inactive', 'Pending'];
      }
      return ['Value_A', 'Value_B', 'Value_C'];
    } else if (colType === 'DATE') {
      return ['2024-01-15', '2024-02-20', '2024-03-10'];
    } else if (['TIMESTAMP', 'DATETIME'].includes(colType)) {
      return ['2024-01-15T10:30:00.000+0000', '2024-02-20T14:15:00.000+0000', '2024-03-10T09:45:00.000+0000'];
    } else if (colType === 'BOOLEAN') {
      return ['TRUE', 'FALSE', 'TRUE'];
    }
    return ['Sample_1', 'Sample_2', 'Sample_3'];
  };
  
  const caData = {
    tables: [
      { name: table1Name, dimensions: [], facts: [], time_dimensions: [] },
      { name: table2Name, dimensions: [], facts: [], time_dimensions: [] },
    ],
    verified_queries: [],
  };
  
  // Add sample values for dimensions
  for (const dim of semanticElements.dimensions || []) {
    const [tableName, colName] = dim.table_column.split('.');
    const schema = tableName === table1Name ? table1Schema : table2Schema;
    const col = schema.find(c => c.name === colName);
    const colType = col ? col.type : 'STRING';
    
    for (const table of caData.tables) {
      if (table.name === tableName) {
        if (colName.toUpperCase().includes('DATE') || colName.toUpperCase().includes('TIME') || ['DATE', 'TIMESTAMP'].includes(colType)) {
          table.time_dimensions.push({
            name: colName,
            sample_values: getSampleValues(colName, colType),
          });
        } else {
          table.dimensions.push({
            name: colName,
            sample_values: getSampleValues(colName, colType),
          });
        }
      }
    }
  }
  
  // Add sample values for facts
  for (const fact of semanticElements.facts || []) {
    const [tableName, colName] = fact.table_column.split('.');
    const schema = tableName === table1Name ? table1Schema : table2Schema;
    const col = schema.find(c => c.name === colName);
    const colType = col ? col.type : 'NUMBER';
    
    for (const table of caData.tables) {
      if (table.name === tableName) {
        table.facts.push({
          name: colName,
          sample_values: getSampleValues(colName, colType),
        });
      }
    }
  }
  
  // Add verified queries
  for (const query of semanticElements.sample_queries || []) {
    caData.verified_queries.push({
      name: query,
      question: query,
      sql: `SELECT * FROM ${table1Name} LIMIT 10`,
      use_as_onboarding_question: false,
      verified_by: 'Demo Generator',
      verified_at: Math.floor(Date.now() / 1000),
    });
  }
  
  // Escape double quotes for JSON and single quotes for SQL string context
  return JSON.stringify(caData)
    .replace(/"/g, '\\"')
    .replace(/'/g, "''");
};

/**
 * Create semantic view
 */
const createSemanticView = async (viewName, table1Name, table2Name, companyName, useCases, onProgress) => {
  onProgress?.('Fetching table schemas for semantic view...');
  
  // Get actual schemas from Snowflake
  const table1Schema = await getTableSchemaFromSnowflake(table1Name);
  const table2Schema = await getTableSchemaFromSnowflake(table2Name);
  
  if (table1Schema.length === 0 || table2Schema.length === 0) {
    throw new Error('Could not retrieve table schemas for semantic view');
  }
  
  onProgress?.('Generating semantic elements with AI...');
  
  // Generate semantic elements using LLM
  const semanticElements = await generateSemanticElements(
    table1Name, table1Schema, table2Name, table2Schema, companyName, useCases
  );
  
  // Ensure ENTITY_ID is included in facts for both tables
  const entityIdFacts = [];
  const existingEntityIds = new Set(semanticElements.facts?.map(f => f.table_column) || []);
  
  for (const tableName of [table1Name, table2Name]) {
    const entityIdRef = `${tableName}.ENTITY_ID`;
    if (!existingEntityIds.has(entityIdRef)) {
      entityIdFacts.push({
        table_column: entityIdRef,
        name: 'ENTITY_ID',
        synonyms: ['id', 'entity_key', 'record_id', 'unique_identifier', 'identifier'],
        comment: `Unique identifier for joining tables from ${tableName}`,
      });
    }
  }
  
  semanticElements.facts = [...entityIdFacts, ...(semanticElements.facts || [])];
  
  // Build SQL components
  const factsSql = buildFactsSql(semanticElements.facts);
  const dimensionsSql = buildDimensionsSql(semanticElements.dimensions || []);
  const caExtension = generateCaExtension(table1Name, table1Schema, table2Name, table2Schema, semanticElements);
  
  const viewDescription = `Semantic view for ${companyName} combining ${table1Name} and ${table2Name} data`.replace(/'/g, "''");
  
  const createViewSql = `CREATE OR REPLACE SEMANTIC VIEW ${CONFIG.database}.${CONFIG.schema}.${viewName}
TABLES (
  ${CONFIG.database}.${CONFIG.schema}.${table1Name} PRIMARY KEY (ENTITY_ID),
  ${CONFIG.database}.${CONFIG.schema}.${table2Name} PRIMARY KEY (ENTITY_ID)
)
RELATIONSHIPS (
  ENTITY_LINK AS ${table1Name}(ENTITY_ID) REFERENCES ${table2Name}(ENTITY_ID)
)
FACTS (
${factsSql}
)
DIMENSIONS (
${dimensionsSql}
)
COMMENT = '${viewDescription}'
WITH EXTENSION (CA='${caExtension}')`;

  onProgress?.('Creating semantic view...');
  
  await executeSqlStatement(createViewSql);
  
  return {
    viewName,
    exampleQueries: semanticElements.sample_queries || [],
  };
};

// ============================================================================
// CORTEX SEARCH SERVICE
// ============================================================================

/**
 * Create Cortex Search Service
 */
const createCortexSearchService = async (serviceName, tableName, onProgress) => {
  onProgress?.('Waiting for table data to settle before creating search service...');
  
  // Wait a bit for the table data to be fully committed before creating search service
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  onProgress?.('Creating Cortex Search Service...');
  
  const createServiceSql = `CREATE OR REPLACE CORTEX SEARCH SERVICE ${CONFIG.database}.${CONFIG.schema}.${serviceName}
ON CHUNK_TEXT
ATTRIBUTES CHUNK_ID, DOCUMENT_ID, ENTITY_ID, DOCUMENT_TYPE, SOURCE_SYSTEM
WAREHOUSE = ${CONFIG.warehouse}
TARGET_LAG = '1 hour'
EMBEDDING_MODEL = 'snowflake-arctic-embed-l-v2.0'
AS (
  SELECT 
    CHUNK_ID,
    DOCUMENT_ID,
    ENTITY_ID,
    DOCUMENT_TYPE,
    SOURCE_SYSTEM,
    CHUNK_TEXT
  FROM ${CONFIG.database}.${CONFIG.schema}.${tableName}
)`;

  try {
    await executeSqlStatement(createServiceSql);
    return serviceName;
  } catch (error) {
    // If initial refresh fails, the service might still be created - it will refresh eventually
    if (error.message?.includes('refresh') || error.message?.includes('Dynamic Table')) {
      console.warn('Cortex Search Service created but initial refresh may still be in progress:', error.message);
      onProgress?.('Search service created (initial indexing may take a few minutes)...');
      return serviceName;
    }
    throw error;
  }
};

// ============================================================================
// AGENT CREATION
// ============================================================================

/**
 * Generate agent instructions using LLM
 */
const generateAgentInstructions = async (companyName, useCases, table1Name, table2Name, chunksTableName) => {
  const prompt = `Generate concise instructions for a Snowflake AI Agent that helps ${companyName} users.

Context:
- Company: ${companyName}
- Use Cases: ${useCases || 'General business analytics and document search'}
- Structured Tables: ${table1Name}, ${table2Name} (joined on ENTITY_ID)
- Unstructured Table: ${chunksTableName} (text chunks for search)

Generate 3 instruction types:
1. response: How to format and present answers (1-2 sentences)
2. orchestration: When to use Analyst vs Search tool (1 sentence)
3. system: Agent's role and capabilities (1-2 sentences)

Return ONLY a JSON object:
{
  "response": "Response instruction here",
  "orchestration": "For structured data questions use Analyst; for document/knowledge questions use Search",
  "system": "System instruction here"
}`;

  const sql = `SELECT AI_COMPLETE('${CONFIG.llmModel}', '${escapeSql(prompt)}') as response`;
  
  const response = await executeSqlStatement(sql);
  const instructions = extractJsonFromResponse(response);
  
  if (!instructions) {
    return {
      response: `Provide clear, actionable insights for ${companyName} business users.`,
      orchestration: 'For structured data questions use Analyst; for document/knowledge questions use Search.',
      system: `You are a helpful ${companyName} business assistant with access to analytics and document search.`,
    };
  }
  
  return instructions;
};

/**
 * Generate sample questions for the agent
 */
const generateSampleQuestions = async (companyName, useCases) => {
  const prompt = `Generate 3 sample questions that a business user would ask an AI assistant for ${companyName}.

Context:
- Company: ${companyName}
- Use Cases: ${useCases || 'General business analytics'}

Generate questions that:
1. One about structured data/metrics (analytics)
2. One about finding information in documents (knowledge retrieval)
3. One combining data analysis with document insights

IMPORTANT: Write questions in natural business language. Do NOT reference database tables, column names, SQL, or any technical database terminology. The questions should sound like a business user asking for insights, not a developer querying a database.

Return ONLY a JSON array of 3 question strings:
["Question 1", "Question 2", "Question 3"]`;

  const sql = `SELECT AI_COMPLETE('${CONFIG.llmModel}', '${escapeSql(prompt)}') as response`;
  
  const response = await executeSqlStatement(sql);
  const questions = extractJsonFromResponse(response, 'array');
  
  if (!questions || questions.length === 0) {
    return [
      `What are the top performing metrics for ${companyName}?`,
      `Find best practices and recommendations in our documents.`,
      `Analyze trends and provide insights with supporting documentation.`,
    ];
  }
  
  return questions;
};

/**
 * Create Snowflake Agent
 */
const createAgent = async (agentName, companyName, semanticViewName, searchServiceName, useCases, onProgress) => {
  onProgress?.('Generating agent instructions...');
  
  // Get table names from semantic view name
  const table1Name = `${companyName.toUpperCase()}_structured_1`;
  const table2Name = `${companyName.toUpperCase()}_structured_2`;
  const chunksTableName = `${companyName.toUpperCase()}_CHUNKS`;
  
  const instructions = await generateAgentInstructions(companyName, useCases, table1Name, table2Name, chunksTableName);
  
  onProgress?.('Generating sample questions...');
  
  const sampleQuestions = await generateSampleQuestions(companyName, useCases);
  
  // Format sample questions for YAML
  const sampleQuestionsYaml = sampleQuestions.map(q => `    - question: "${q.replace(/"/g, '\\"')}"`).join('\n');
  
  const cleanCompanyName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
  const analystToolName = `${cleanCompanyName}_Analyst`;
  const searchToolName = `${cleanCompanyName}_Search`;
  
  const fullSemanticView = `${CONFIG.database}.${CONFIG.schema}.${semanticViewName}`;
  const fullSearchService = `${CONFIG.database}.${CONFIG.schema}.${searchServiceName}`;
  
  const createAgentSql = `CREATE OR REPLACE AGENT ${CONFIG.database}.${CONFIG.schema}.${agentName}
COMMENT = 'Custom Agent for ${companyName} Demo'
PROFILE = '{"display_name": "${companyName} Business Assistant"}'
FROM SPECIFICATION
$$
models:
  orchestration: ${AGENT_CONFIG.orchestrationModel}

orchestration:
  budget:
    seconds: ${AGENT_CONFIG.budgetSeconds}
    tokens: ${AGENT_CONFIG.budgetTokens}

instructions:
  response: "${instructions.response.replace(/"/g, '\\"')}"
  orchestration: "${instructions.orchestration.replace(/"/g, '\\"')}"
  system: "${instructions.system.replace(/"/g, '\\"')}"
  sample_questions:
${sampleQuestionsYaml}

tools:
  - tool_spec:
      type: "cortex_analyst_text_to_sql"
      name: "${analystToolName}"
      description: "Converts natural language to SQL queries for ${companyName} data analysis"
  - tool_spec:
      type: "cortex_search"
      name: "${searchToolName}"
      description: "Searches ${companyName} documents and knowledge base"

tool_resources:
  ${analystToolName}:
    semantic_view: "${fullSemanticView}"
    execution_environment: {
      type: "warehouse",
      warehouse: "${CONFIG.warehouse}",
      query_timeout: 120
    }
  ${searchToolName}:
    name: "${fullSearchService}"
    max_results: "5"
    title_column: "DOCUMENT_TYPE"
    id_column: "ENTITY_ID"
$$`;

  onProgress?.('Creating Snowflake Agent...');
  
  await executeSqlStatement(createAgentSql);
  
  return {
    agentName,
    sampleQuestions,
  };
};

/**
 * Build Agent API URL
 */
const buildAgentApiUrl = (agentName) => {
  return `https://SFCOGSOPS-SNOWHOUSE_AWS_US_WEST_2.snowflakecomputing.com/api/v2/databases/${CONFIG.database}/schemas/${CONFIG.schema}/agents/${agentName}:run`;
};

// ============================================================================
// MAIN ORCHESTRATION FUNCTION
// ============================================================================

/**
 * Generate complete custom demo data infrastructure
 */
export const generateCustomDemoData = async ({ companyUrl, useCases, recordsPerTable }, onStatusUpdate) => {
  const companyName = extractCompanyName(companyUrl);
  const timestamp = generateTimestamp();
  const numRecords = parseInt(recordsPerTable) || 100;
  
  console.log(`Starting demo generation for ${companyName} with ${numRecords} records`);
  
  // ========== STEP 1: Generate Table Schemas with Raven ==========
  onStatusUpdate?.('Generating table schemas with AI...');
  
  const tableSchemas = await generateTableSchemasWithRaven(companyUrl, useCases, companyName);
  
  const table1Info = tableSchemas.structured_1;
  const table2Info = tableSchemas.structured_2;
  const chunksInfo = tableSchemas.unstructured;
  
  // Add timestamp to table names for uniqueness
  const table1Name = `${table1Info.name}_${timestamp}`;
  const table2Name = `${table2Info.name}_${timestamp}`;
  const chunksTableName = `${chunksInfo.name}_${timestamp}`;
  
  console.log('Table schemas generated:', { table1Name, table2Name, chunksTableName });
  
  // ========== STEP 2: Generate Entity IDs with 70% Overlap ==========
  onStatusUpdate?.('Generating entity IDs...');
  
  // Create base pool of unique IDs
  const baseEntityIds = Array.from({ length: numRecords * 2 }, (_, i) => i + 1);
  // Shuffle for randomness
  for (let i = baseEntityIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [baseEntityIds[i], baseEntityIds[j]] = [baseEntityIds[j], baseEntityIds[i]];
  }
  
  // Table 1: first numRecords unique values
  const table1EntityIds = baseEntityIds.slice(0, numRecords);
  
  // Table 2: 70% overlap with table 1, 30% unique
  const overlapSize = Math.floor(numRecords * 0.7);
  const table2EntityIds = [
    ...table1EntityIds.slice(0, overlapSize),
    ...baseEntityIds.slice(numRecords, numRecords + (numRecords - overlapSize)),
  ];
  // Shuffle table 2 IDs
  for (let i = table2EntityIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [table2EntityIds[i], table2EntityIds[j]] = [table2EntityIds[j], table2EntityIds[i]];
  }
  
  // ========== STEP 3: Generate Structured Data ==========
  onStatusUpdate?.(`Generating data for ${table1Name}...`);
  const table1Data = generateDataFromSchema(table1Info, numRecords, table1EntityIds);
  
  onStatusUpdate?.(`Generating data for ${table2Name}...`);
  const table2Data = generateDataFromSchema(table2Info, numRecords, table2EntityIds);
  
  // ========== STEP 4: Generate Unstructured Content ==========
  onStatusUpdate?.('Generating unstructured text content...');
  const textSamples = await generateUnstructuredContent(chunksInfo, Math.min(numRecords, 50), companyName);
  const chunksData = generateChunkedDataFromSamples(textSamples, numRecords, chunksInfo, companyName);
  
  // ========== STEP 5: Create Tables in Snowflake ==========
  onStatusUpdate?.(`Creating table ${table1Name}...`);
  const createTable1Sql = buildStructuredCreateTableSql(table1Name, table1Info.columns);
  await executeSqlStatement(createTable1Sql);
  
  onStatusUpdate?.(`Inserting data into ${table1Name}...`);
  const insertTable1Sql = buildStructuredInsertSql(table1Name, table1Info.columns, table1Data);
  if (insertTable1Sql) {
    await executeSqlStatement(insertTable1Sql, true);
  }
  
  onStatusUpdate?.(`Creating table ${table2Name}...`);
  const createTable2Sql = buildStructuredCreateTableSql(table2Name, table2Info.columns);
  await executeSqlStatement(createTable2Sql);
  
  onStatusUpdate?.(`Inserting data into ${table2Name}...`);
  const insertTable2Sql = buildStructuredInsertSql(table2Name, table2Info.columns, table2Data);
  if (insertTable2Sql) {
    await executeSqlStatement(insertTable2Sql, true);
  }
  
  onStatusUpdate?.(`Creating table ${chunksTableName}...`);
  const createChunksSql = buildUnstructuredCreateTableSql(chunksTableName);
  await executeSqlStatement(createChunksSql);
  
  onStatusUpdate?.(`Inserting chunks into ${chunksTableName}...`);
  const insertChunksSql = buildUnstructuredInsertSql(chunksTableName, chunksData);
  if (insertChunksSql) {
    await executeSqlStatement(insertChunksSql, true);
  }
  
  // ========== STEP 6: Create Cortex Search Service ==========
  const searchServiceName = `${chunksTableName}_SEARCH_SERVICE`;
  await createCortexSearchService(searchServiceName, chunksTableName, onStatusUpdate);
  
  // ========== STEP 7: Create Semantic View ==========
  const semanticViewName = `${companyName.toUpperCase()}_${timestamp}_SEMANTIC_VIEW`;
  const semanticViewResult = await createSemanticView(
    semanticViewName, table1Name, table2Name, companyName, useCases, onStatusUpdate
  );
  
  // ========== STEP 8: Create Agent ==========
  const agentName = `${companyName}_${timestamp}_agent`;
  const agentResult = await createAgent(
    agentName, companyName, semanticViewName, searchServiceName, useCases, onStatusUpdate
  );
  
  const agentUrl = buildAgentApiUrl(agentName);
  
  // ========== RETURN RESULTS ==========
  const results = {
    success: true,
    companyName,
    tables: {
      structured1: table1Name,
      structured2: table2Name,
      unstructured: chunksTableName,
    },
    searchServiceName,
    semanticViewName,
    agentName,
    agentUrl,
    sampleQuestions: agentResult.sampleQuestions,
    schema: `${CONFIG.database}.${CONFIG.schema}`,
    recordCount: numRecords,
    chunksCount: chunksData.length,
    message: `Successfully created tables ${table1Name}, ${table2Name}, ${chunksTableName}, ` +
      `search service ${searchServiceName}, semantic view ${semanticViewName}, and agent ${agentName}`,
  };
  
  console.log('Demo generation complete:', results);
  
  return results;
};
