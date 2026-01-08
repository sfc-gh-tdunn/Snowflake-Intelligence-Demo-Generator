import { getRavenAgentEndpoint, getSnowHouseToken } from '../config/endpoints';

/**
 * Call the Raven Sales Assistant Agent to get discovery questions
 * @param {string} companyUrl - The company URL to analyze
 * @returns {Promise<string[]>} Array of top 5 discovery questions
 */
export const fetchDiscoveryQuestions = async (companyUrl) => {
  const endpoint = getRavenAgentEndpoint();
  const token = getSnowHouseToken();

  if (!endpoint || !token) {
    console.warn('Raven Agent endpoint or token not configured');
    return [];
  }

  const payload = {
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Please review the company ${companyUrl} and identify their main industry, goal, and any recent major news. With this company profile, review and determine the most important Snowflake intelligence use case for that company. Return one list of the top 5 questions typical of that use case. Do not return anything besides those top questions. Always start your response with 'Here are your questions:'`
          }
        ]
      }
    ],
    tool_choice: {
      type: 'auto',
      name: []
    }
  };

  try {
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
      console.error('Raven Agent API error:', response.status);
      return [];
    }

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let questionsText = '';
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
              questionsText += data.text + '\n';
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    // Extract questions from the text
    const questions = [];
    
    // Try to match **bold** questions first
    let matches = questionsText.match(/\d+\.\s+\*\*(.*?)\*\*/g);
    if (matches) {
      matches.forEach(match => {
        const q = match.replace(/^\d+\.\s+\*\*/, '').replace(/\*\*$/, '').trim();
        if (q) questions.push(q);
      });
    }
    
    // Fallback: try to extract numbered lines
    if (questions.length === 0) {
      matches = questionsText.match(/\d+\.\s+([^\n]+)/g);
      if (matches) {
        matches.forEach(match => {
          const q = match.replace(/^\d+\.\s+/, '').trim();
          if (q && !q.startsWith('Here are')) questions.push(q);
        });
      }
    }

    return questions.slice(0, 5);
  } catch (error) {
    console.error('Error calling Raven Agent:', error);
    return [];
  }
};

