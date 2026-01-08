import { getEndpoint, getAuthToken } from '../config/endpoints';

/**
 * Call Snowflake Agent API with streaming response
 * @param {string} question - The user's question
 * @param {Array} chatHistory - Previous messages in the conversation
 * @param {string} mainVertical - Main vertical selection
 * @param {string} subVertical - Sub-vertical selection
 * @param {function} onChunk - Callback for text chunks: (text) => void
 * @param {function} onChart - Callback for chart data: (chartSpec) => void
 * @param {function} onThinking - Callback for thinking updates: (thinking) => void
 * @param {function} onStatus - Callback for status updates: (status, message) => void
 * @returns {Promise<{text: string, charts: Array, thinking: string}>} Complete response
 */
export const streamChatResponse = async (
  question, 
  chatHistory, 
  mainVertical, 
  subVertical, 
  onChunk,
  onChart = null,
  onThinking = null,
  onStatus = null
) => {
  const endpoint = getEndpoint(mainVertical, subVertical);
  const token = getAuthToken(mainVertical, subVertical);

  if (!endpoint) {
    throw new Error(`No API endpoint configured for ${mainVertical}${subVertical ? ` / ${subVertical}` : ''}`);
  }

  if (!token) {
    throw new Error(`No auth token configured for ${mainVertical}${subVertical ? ` / ${subVertical}` : ''}`);
  }

  // Build messages array for the API (Snowflake Agent format)
  const messages = [];

  // Add chat history (convert to Snowflake Agent format)
  for (const msg of chatHistory) {
    const content = typeof msg.content === 'string'
      ? [{ type: 'text', text: msg.content }]
      : msg.content;
    
    messages.push({
      role: msg.role,
      content,
    });
  }

  // Add current question
  messages.push({
    role: 'user',
    content: [{ type: 'text', text: question }],
  });

  const payload = {
    messages,
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
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  // Process streaming response
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';
  let fullThinking = '';
  let currentEvent = '';
  let charts = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    
    // Keep the last incomplete line in buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Track event type
      if (trimmedLine.startsWith('event:')) {
        currentEvent = trimmedLine.slice(6).trim();
        continue;
      }

      // Process data payload
      if (trimmedLine.startsWith('data:')) {
        const dataStr = trimmedLine.slice(5).trim();
        
        // Skip [DONE] marker
        if (dataStr === '[DONE]') continue;
        
        try {
          const data = JSON.parse(dataStr);
          
          // Handle different event types
          switch (currentEvent) {
            case 'response.status':
              if (onStatus && data.status && data.message) {
                onStatus(data.status, data.message);
              }
              break;
              
            case 'response.thinking.delta':
              // Streaming thinking - accumulate
              if (data.text) {
                fullThinking += data.text;
                if (onThinking) {
                  onThinking(fullThinking);
                }
              }
              break;
              
            case 'response.thinking':
              // Complete thinking block
              if (data.text) {
                fullThinking = data.text;
                if (onThinking) {
                  onThinking(fullThinking);
                }
              }
              break;
              
            case 'response.text.delta':
              // Streaming text response
              if (data.text) {
                fullResponse += data.text;
                onChunk(data.text);
              }
              break;
              
            case 'response.text':
              // Complete text block (don't add - already have from deltas)
              break;
              
            case 'response.chart':
              // Chart data
              if (data.chart_spec) {
                try {
                  const chartSpec = typeof data.chart_spec === 'string' 
                    ? JSON.parse(data.chart_spec) 
                    : data.chart_spec;
                  charts.push(chartSpec);
                  if (onChart) {
                    onChart(chartSpec);
                  }
                } catch (e) {
                  console.error('Failed to parse chart spec:', e);
                }
              }
              break;
              
            case 'response.tool_result':
              // Tool results may contain charts
              if (data.content && Array.isArray(data.content)) {
                for (const item of data.content) {
                  if (item.json && item.json.charts) {
                    for (const chartSpecStr of item.json.charts) {
                      try {
                        const chartSpec = typeof chartSpecStr === 'string'
                          ? JSON.parse(chartSpecStr)
                          : chartSpecStr;
                        charts.push(chartSpec);
                        if (onChart) {
                          onChart(chartSpec);
                        }
                      } catch (e) {
                        console.error('Failed to parse chart from tool result:', e);
                      }
                    }
                  }
                }
              }
              break;
              
            case 'response':
              // Final response object - extract any remaining content
              if (data.content && Array.isArray(data.content)) {
                for (const block of data.content) {
                  if (block.type === 'chart' && block.chart && block.chart.chart_spec) {
                    try {
                      const chartSpec = typeof block.chart.chart_spec === 'string'
                        ? JSON.parse(block.chart.chart_spec)
                        : block.chart.chart_spec;
                      // Only add if not already present
                      if (!charts.find(c => JSON.stringify(c) === JSON.stringify(chartSpec))) {
                        charts.push(chartSpec);
                        if (onChart) {
                          onChart(chartSpec);
                        }
                      }
                    } catch (e) {
                      console.error('Failed to parse final chart:', e);
                    }
                  }
                }
              }
              break;
              
            default:
              // Fallback text extraction for unknown events
              const text = extractText(data);
              if (text && !currentEvent.includes('delta')) {
                // Avoid duplicate text from non-delta events
              }
              break;
          }
        } catch (e) {
          // Skip invalid JSON
          console.debug('Failed to parse SSE data:', dataStr.slice(0, 100));
        }
      }
    }
  }

  return {
    text: fullResponse,
    charts,
    thinking: fullThinking
  };
};

/**
 * Extract text from various response formats (fallback)
 * @param {Object} data - Response data object
 * @returns {string} Extracted text
 */
const extractText = (data) => {
  // Check for delta content
  if (data.delta) {
    const delta = data.delta;
    if (typeof delta.content === 'string') {
      return delta.content;
    }
    if (Array.isArray(delta.content)) {
      return delta.content
        .filter(block => block.type === 'text')
        .map(block => block.text || '')
        .join('');
    }
  }

  // Check for message content
  if (data.message) {
    const message = data.message;
    if (typeof message.content === 'string') {
      return message.content;
    }
    if (Array.isArray(message.content)) {
      return message.content
        .filter(block => block.type === 'text')
        .map(block => block.text || '')
        .join('');
    }
  }

  // Direct content
  if (typeof data.content === 'string') {
    return data.content;
  }

  // Direct text
  if (typeof data.text === 'string') {
    return data.text;
  }

  return '';
};
