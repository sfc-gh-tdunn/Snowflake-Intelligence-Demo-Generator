import React, { useState, useRef, useEffect, useCallback } from 'react';
import { streamChatResponse } from '../services/snowflakeAgent';

// Chart component that renders Vega-Lite specs using dynamic import
function VegaChart({ spec, id }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (containerRef.current && spec) {
      // Dynamic import to avoid webpack issues with vega
      import('vega-embed').then((vegaEmbed) => {
        const embed = vegaEmbed.default;
        
        // Add responsive sizing
        const responsiveSpec = {
          ...spec,
          width: 'container',
          height: 300,
          autosize: {
            type: 'fit',
            contains: 'padding'
          }
        };

        embed(containerRef.current, responsiveSpec, {
          actions: {
            export: true,
            source: false,
            compiled: false,
            editor: false
          },
          theme: 'dark',
          renderer: 'canvas'
        }).catch(err => {
          console.error('Vega embed error:', err);
          setError(err.message);
        });
      }).catch(err => {
        console.error('Failed to load vega-embed:', err);
        setError('Failed to load chart library');
      });
    }
  }, [spec]);

  if (error) {
    return (
      <div className="si-chart-container si-chart-error">
        <p>Failed to render chart: {error}</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      id={id}
      className="si-chart-container"
    />
  );
}

// Default questions by vertical/subvertical
// Keys must match exactly with values from MAIN_VERTICAL_OPTIONS and SUB_VERTICAL_OPTIONS in endpoints.js
const DEFAULT_QUESTIONS = {
  'Retail': [
    'How are the sales for my 2 newest scents doing?',
    'If Peachwood Breeze sells online like previous top performing scents, what will be the likely sales online over the next 12 weeks?',
    'Look at my full range of scents, identify products that had a slow down in growth and tell me why?'
  ],
  'Health Services|Clinical Trials': [
    'Analyse the small number of participants who have completed the covid trial and give me a breakdown of who responded yes and who responded no.',
    'Of those who responded yes, please look at their medical profiles to understand a clear picture of who we potentially have.',
    'Can we look at the rest of the population, produce a sample of 500 patients that would be good potential candidates for the next phase of the trial?'
  ],
  'Health Services|Genomics': [
    'Show me all BRCA1 and BRCA2 variants in our population by clinical significance.',
    'Give me a stacked bar chart showing colon cancer gene variants (MLH1, MSH2, MSH6, PMS2) by clinical significance.',
    'Are there families with multiple members carrying SERPINA1 deficiency variants? Show me the family relationships.'
  ],
  'Financial Services|Investment Portfolio Analytics': [
    'Give me the breakdown of sector allocation across my full portfolio.',
    'What does our latest research say about our technology holdings and how are they positioned in the market?',
    'What are other industry trends I should be aware of and how could I diversify the technology holdings?'
  ],
  'Financial Services|Assets Management Advisor': [
    'Which clients have portfolios underperforming their benchmarks by more than 5%?',
    'Show me progress toward retirement goals for clients aged 55 and above.',
    'Combine portfolio data with sector research to recommend rebalancing for conservative clients.'
  ],
  'Financial Services|Claims Processor': [
    'Was the payment made according to the state guidelines?',
    'Was a reserve rationale documented in the claim file notes?',
    'Were the reserving or payment amounts in excess of the examiner\'s authority?'
  ],
  'Manufacturing|Supply Chain Assistant': [
    'Where do I have critical low inventory levels?',
    'Where do we have low inventory of rare earth materials?',
    'For plants with low inventory, compare the cost of replenishing from a supplier vs transferring from another plant.'
  ],
  'Manufacturing|Predictive Maintenance': [
    'What was the total financial impact of unplanned downtime last month?',
    'Show me average, min, and max temperature sensor readings by asset ordered by highest temperature readings.',
    'Show me downtime impact per hour and average failure probability by asset, line, and plant.'
  ],
  'Advertising, Media & Entertainment': [
    'How many of our players are in Free tier vs paid tiers (Premium vs VIP)?',
    'Can you identify anyone who is VIP tier and plays RPG games frequently with high propensity scores?',
    'Save VIP RPG players with high purchase propensity as a player segment called "VIP RPG Whales".'
  ]
};

function ChatPage({ logoUrl, brandColor, mainVertical, subVertical, discoveryQuestions, customDataResult, onStartOver }) {
  const [chatHistory, setChatHistory] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [currentCharts, setCurrentCharts] = useState([]);
  const [currentThinking, setCurrentThinking] = useState('');
  const [currentStatus, setCurrentStatus] = useState('');
  const [error, setError] = useState('');
  const [expandedThinking, setExpandedThinking] = useState({});
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Get default questions based on vertical/subvertical
  const getDefaultQuestions = useCallback(() => {
    // For Custom vertical, use the sample questions from agent creation
    // The service returns sampleQuestions directly in the result
    if (mainVertical === 'Custom' && customDataResult?.sampleQuestions?.length > 0) {
      return customDataResult.sampleQuestions.slice(0, 3);
    }
    // Try with subvertical first
    if (subVertical) {
      const key = `${mainVertical}|${subVertical}`;
      if (DEFAULT_QUESTIONS[key]) {
        return DEFAULT_QUESTIONS[key].slice(0, 3);
      }
    }
    // Fall back to main vertical only
    if (DEFAULT_QUESTIONS[mainVertical]) {
      return DEFAULT_QUESTIONS[mainVertical].slice(0, 3);
    }
    // Default fallback
    return [];
  }, [mainVertical, subVertical, customDataResult]);

  const defaultQuestions = getDefaultQuestions();

  // Scroll to bottom when chat updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, currentResponse]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '42px';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [inputValue]);

  const handleChartReceived = useCallback((chartSpec) => {
    setCurrentCharts(prev => [...prev, chartSpec]);
  }, []);

  const handleThinkingUpdate = useCallback((thinking) => {
    setCurrentThinking(thinking);
  }, []);

  const handleStatusUpdate = useCallback((status, message) => {
    setCurrentStatus(message);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isStreaming) return;
    const question = inputValue.trim();
    setInputValue('');
    submitQuestion(question);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const toggleThinking = (messageId) => {
    setExpandedThinking(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  const copyToClipboard = async (text, messageId) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Handle clicking a suggested question
  const handleSuggestedQuestion = (question) => {
    setInputValue(question);
    // Auto-submit the question
    setTimeout(() => {
      const fakeEvent = { preventDefault: () => {} };
      setInputValue('');
      submitQuestion(question);
    }, 100);
  };

  // Extracted submit logic so we can call it programmatically
  const submitQuestion = async (questionText) => {
    if (!questionText.trim() || isStreaming) return;

    const userMessage = questionText.trim();
    setError('');
    setCurrentResponse('');
    setCurrentCharts([]);
    setCurrentThinking('');
    setCurrentStatus('');

    const newHistory = [...chatHistory, { role: 'user', content: userMessage, id: Date.now() }];
    setChatHistory(newHistory);

    setIsStreaming(true);

    // Get custom agent URL if available (for Custom vertical)
    const customAgentUrl = customDataResult?.agentUrl || null;

    try {
      let fullResponse = '';
      
      const result = await streamChatResponse(
        userMessage,
        chatHistory,
        mainVertical,
        subVertical,
        (chunk) => {
          fullResponse += chunk;
          setCurrentResponse(fullResponse);
        },
        handleChartReceived,
        handleThinkingUpdate,
        handleStatusUpdate,
        customAgentUrl
      );

      setChatHistory([...newHistory, { 
        role: 'assistant', 
        content: result.text || fullResponse, 
        id: Date.now(),
        thinking: result.thinking || currentThinking,
        charts: result.charts || currentCharts
      }]);
      setCurrentResponse('');
      setCurrentCharts([]);
      setCurrentThinking('');
      setCurrentStatus('');
    } catch (err) {
      setError(err.message || 'Failed to get response');
      setChatHistory([
        ...newHistory,
        { role: 'assistant', content: `Error: ${err.message}`, isError: true, id: Date.now() }
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  // Parse markdown-like formatting
  const renderFormattedText = (text) => {
    if (!text) return null;
    
    // Split by double newlines for paragraphs
    const parts = text.split(/\n\n+/);
    
    return parts.map((part, i) => {
      // Handle headers
      if (part.startsWith('## ')) {
        return <h3 key={i} className="si-text-header">{part.slice(3)}</h3>;
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return <p key={i} className="si-text-bold">{part.slice(2, -2)}</p>;
      }
      
      // Handle bullet lists
      if (part.includes('\n- ') || part.startsWith('- ')) {
        const lines = part.split('\n');
        return (
          <ul key={i} className="si-text-list">
            {lines.map((line, j) => {
              if (line.startsWith('- ')) {
                return <li key={j}>{renderInlineFormatting(line.slice(2))}</li>;
              }
              return line ? <p key={j}>{renderInlineFormatting(line)}</p> : null;
            })}
          </ul>
        );
      }
      
      // Handle numbered lists
      if (/^\d+\.\s/.test(part)) {
        const lines = part.split('\n');
        return (
          <ol key={i} className="si-text-list">
            {lines.map((line, j) => {
              const match = line.match(/^\d+\.\s(.+)/);
              if (match) {
                return <li key={j}>{renderInlineFormatting(match[1])}</li>;
              }
              return line ? <p key={j}>{renderInlineFormatting(line)}</p> : null;
            })}
          </ol>
        );
      }
      
      // Regular paragraph
      return <p key={i}>{renderInlineFormatting(part)}</p>;
    });
  };

  // Handle inline formatting (bold, etc)
  const renderInlineFormatting = (text) => {
    if (!text) return null;
    
    // Replace **text** with bold
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <div className={`si-chat-page ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
      {/* Main chat content */}
      <main className="si-chat-main">
        {/* Header with brand color */}
        <header className="si-chat-header" style={{ backgroundColor: brandColor }}>
          <div className="si-header-content">
            {/* Snowflake branding */}
            <div className="si-header-snowflake">
              <svg className="si-snowflake-logo" viewBox="0 0 143 32" fill="currentColor" aria-label="Snowflake logo">
                <path fillRule="evenodd" d="M140.304 9.45h-.375v.455h.375c.175 0 .287-.078.287-.223 0-.154-.105-.232-.287-.232Zm-.837-.422h.847c.461 0 .767.249.767.638a.606.606 0 0 1-.306.534l.331.474v.094h-.48l-.322-.456h-.375v.456h-.462v-1.74Zm2.362.902c0-.93-.627-1.635-1.588-1.635-.942 0-1.569.671-1.569 1.635 0 .92.627 1.636 1.569 1.636.961 0 1.588-.706 1.588-1.636Zm.394 0c0 1.093-.741 2.007-1.979 2.007-1.229 0-1.963-.92-1.963-2.007 0-1.092.732-2.006 1.963-2.006 1.238.002 1.979.913 1.979 2.006ZM31.267 13.821l-3.822 2.181 3.822 2.175a1.973 1.973 0 0 1 .736 2.717 2.03 2.03 0 0 1-2.748.725l-6.845-3.9a1.967 1.967 0 0 1-.914-1.135 1.918 1.918 0 0 1-.091-.646c.005-.157.028-.313.07-.47.137-.485.457-.92.932-1.194l6.843-3.895a2.026 2.026 0 0 1 2.749.73c.561.95.233 2.162-.732 2.712ZM27.648 24.39l-6.84-3.893a2.001 2.001 0 0 0-1.166-.26 1.994 1.994 0 0 0-1.862 1.98v7.796c0 1.1.897 1.988 2.012 1.988 1.114 0 2.014-.89 2.014-1.988v-4.36l3.83 2.181a2.022 2.022 0 0 0 2.749-.725c.555-.95.228-2.17-.737-2.72Zm-7.894-7.625-2.844 2.802a.566.566 0 0 1-.357.15h-.835a.577.577 0 0 1-.356-.15l-2.844-2.802a.558.558 0 0 1-.147-.35v-.826a.57.57 0 0 1 .147-.354l2.842-2.803a.575.575 0 0 1 .356-.147h.837a.57.57 0 0 1 .357.147l2.844 2.803a.57.57 0 0 1 .147.354v.826c0 .11-.065.27-.147.35Zm-2.273-.778a.587.587 0 0 0-.151-.354l-.823-.81a.582.582 0 0 0-.357-.147h-.033a.576.576 0 0 0-.354.147l-.823.81a.578.578 0 0 0-.144.354v.032c0 .113.063.27.144.35l.823.812c.082.08.24.148.354.148h.033a.587.587 0 0 0 .357-.148l.823-.812a.569.569 0 0 0 .151-.35v-.032ZM4.624 7.606l6.842 3.898c.369.21.777.292 1.168.26a2 2 0 0 0 1.863-1.983V1.986C14.497.89 13.595 0 12.485 0c-1.114 0-2.014.89-2.014 1.986v4.362L6.638 4.162a2.026 2.026 0 0 0-2.749.727 1.974 1.974 0 0 0 .735 2.718Zm15.018 4.158c.392.032.8-.05 1.166-.26l6.84-3.897a1.977 1.977 0 0 0 .737-2.718 2.027 2.027 0 0 0-2.749-.727l-3.83 2.186V1.986C21.806.89 20.906 0 19.792 0c-1.115 0-2.012.89-2.012 1.986V9.78c-.003 1.047.818 1.907 1.862 1.983Zm-7.008 8.472a2.001 2.001 0 0 0-1.168.26l-6.842 3.893a1.98 1.98 0 0 0-.737 2.72 2.027 2.027 0 0 0 2.749.724l3.833-2.181v4.36c0 1.1.9 1.988 2.014 1.988 1.11 0 2.012-.89 2.012-1.988v-7.795a1.992 1.992 0 0 0-1.86-1.981Zm-1.855-3.652a1.98 1.98 0 0 0 .09-.646 1.984 1.984 0 0 0-1.01-1.664L3.023 10.38c-.965-.548-2.196-.223-2.749.73-.559.95-.228 2.162.737 2.712l3.821 2.181-3.823 2.175a1.973 1.973 0 0 0-.737 2.717 2.028 2.028 0 0 0 2.749.725l6.838-3.9c.464-.26.776-.672.92-1.135ZM95.647 4.935h-.189c-.025 0-.049.003-.074.005-.024-.002-.047-.005-.073-.005-.485 0-.958.056-1.399.2a2.53 2.53 0 0 0-1.144.737l-.002-.003v.005c-.322.352-.532.773-.663 1.252-.128.48-.181 1.021-.186 1.638v1.192h-1.331a.823.823 0 0 0-.83.81.878.878 0 0 0 .242.614.909.909 0 0 0 .597.27h1.322v9.695l-.002.023c0 .228.095.437.251.587.154.147.371.234.606.234a.823.823 0 0 0 .819-.823v-9.721h1.431a.896.896 0 0 0 .595-.263.85.85 0 0 0 .251-.605v-.032c-.004-.437-.375-.794-.836-.794H93.59V8.764c.01-.525.065-.918.144-1.203.077-.288.184-.468.278-.58a.954.954 0 0 1 .41-.249c.198-.064.473-.103.844-.103h.044c.021 0 .045-.005.066-.005.025 0 .05.005.077.005h.187c.475 0 .857-.38.857-.847a.84.84 0 0 0-.85-.847Zm29.515 6.288a.841.841 0 0 0 .259-.598.788.788 0 0 0-.261-.58h.002c-.002-.004-.005-.004-.005-.004 0-.005-.004-.005-.004-.005h-.003a.836.836 0 0 0-.587-.244.85.85 0 0 0-.592.249l-6.589 6.336V5.73c0-.458-.389-.833-.867-.833a.833.833 0 0 0-.592.246.84.84 0 0 0-.25.587v15.59a.83.83 0 0 0 .25.585.853.853 0 0 0 .592.246c.478 0 .867-.37.867-.828v-2.575l2.145-2.114 4.374 5.207c.081.12.193.202.305.246.126.046.25.064.359.064a.889.889 0 0 0 .55-.177l.01-.007.011-.011a.886.886 0 0 0 .276-.629.86.86 0 0 0-.208-.552v-.002l-4.453-5.34 4.406-4.206h.005v-.003Zm-11.897-1.072c.156.15.252.364.252.596V21.32a.827.827 0 0 1-.247.584.858.858 0 0 1-.595.246.856.856 0 0 1-.594-.246.817.817 0 0 1-.25-.584v-1.031c-1.06 1.13-2.55 1.861-4.198 1.861a5.734 5.734 0 0 1-4.176-1.81 6.22 6.22 0 0 1-1.711-4.305c0-1.669.65-3.199 1.711-4.308a5.738 5.738 0 0 1 4.176-1.806c1.648 0 3.138.709 4.198 1.834v-1.006a.826.826 0 0 1 .844-.828c.224 0 .436.085.59.23Zm-1.434 5.884c0-1.25-.478-2.37-1.242-3.18-.763-.806-1.812-1.296-2.956-1.298-1.136 0-2.18.492-2.952 1.298a4.615 4.615 0 0 0-1.25 3.18c0 1.249.485 2.36 1.25 3.163.767.803 1.814 1.286 2.952 1.286a4.067 4.067 0 0 0 2.958-1.284 4.578 4.578 0 0 0 1.24-3.165Zm-67.814-.297c-.681-.318-1.453-.55-2.222-.803-.709-.237-1.427-.437-1.94-.702-.258-.136-.459-.28-.59-.442a.82.82 0 0 1-.2-.55c.002-.306.09-.552.242-.773.231-.326.618-.582 1.04-.745.417-.166.87-.244 1.194-.244.956.002 1.56.315 2.024.642.228.163.422.331.606.467.093.071.181.136.284.184.096.046.21.085.334.085.079 0 .156-.014.228-.044a.724.724 0 0 0 .205-.126.722.722 0 0 0 .152-.203.626.626 0 0 0 .049-.239.882.882 0 0 0-.117-.416c-.128-.228-.324-.447-.573-.668a5.576 5.576 0 0 0-1.388-.87c-.529-.234-1.095-.393-1.634-.393-1.252 0-2.296.28-3.054.796-.396.27-.744.564-.988.971-.25.408-.39.911-.408 1.567v.088c-.003.635.205 1.16.531 1.571.494.619 1.229.987 1.95 1.25.717.262 1.438.418 1.89.568.639.209 1.317.437 1.814.738.247.154.445.32.58.502.13.186.205.38.21.623v.019c-.002.354-.107.63-.282.867-.264.355-.7.612-1.163.778a4.1 4.1 0 0 1-1.252.228c-1.092 0-1.821-.26-2.353-.52-.266-.131-.48-.26-.676-.37a2.29 2.29 0 0 0-.282-.139.809.809 0 0 0-.303-.062.585.585 0 0 0-.212.04.628.628 0 0 0-.187.119.87.87 0 0 0-.182.24.64.64 0 0 0-.065.284c0 .164.06.311.15.447.137.195.34.368.591.543.262.172.572.34.928.508.795.37 1.812.564 2.586.575h.002c1.203 0 2.24-.273 3.115-.908v-.003h.002c.856-.635 1.387-1.58 1.387-2.648 0-.587-.14-1.084-.382-1.49-.368-.615-.965-1.022-1.641-1.342ZM99.123 4.896a.84.84 0 0 0-.594.246.829.829 0 0 0-.25.587v15.59a.81.81 0 0 0 .25.585.86.86 0 0 0 .594.246c.478 0 .865-.37.867-.828V5.729c-.002-.46-.387-.833-.867-.833Zm38.792 10.745v.083c0 .23-.105.437-.264.573a.882.882 0 0 1-.583.212h-9.456c.24 2.277 2.085 3.96 4.283 3.975h.557c.728.003 1.436-.246 2.061-.655a5.096 5.096 0 0 0 1.546-1.602.781.781 0 0 1 .312-.297.855.855 0 0 1 .823.016l.01.005.009.007a.891.891 0 0 1 .385.72c0 .147-.04.295-.119.43l-.003.005-.002.002a7.054 7.054 0 0 1-2.105 2.133c-.858.55-1.851.897-2.917.897h-.566a5.973 5.973 0 0 1-4.241-1.81 6.105 6.105 0 0 1-1.744-4.282c0-1.694.669-3.228 1.758-4.34a5.967 5.967 0 0 1 4.273-1.796c1.597 0 3.033.628 4.097 1.654 1.063 1.026 1.757 2.453 1.881 4.056l.005.014Zm-1.847-.787c-.48-1.919-2.187-3.285-4.136-3.283-1.998 0-3.681 1.337-4.203 3.283h8.339ZM53.002 9.942a5.11 5.11 0 0 0-3.423 1.318v-.483a.835.835 0 0 0-.233-.582.816.816 0 0 0-.585-.25.84.84 0 0 0-.606.248.835.835 0 0 0-.238.584V21.57l.035.035.003.004a.46.46 0 0 0 .055.113c.115.2.303.352.537.419l.032.01h.182a.864.864 0 0 0 .36-.08.73.73 0 0 0 .258-.213h.002c.01-.01.012-.02.021-.03a.803.803 0 0 0 .114-.18c.024-.064.04-.126.052-.172l.007-.03v-6.481a3.44 3.44 0 0 1 1.03-2.375 3.386 3.386 0 0 1 2.392-.985c.949 0 1.795.378 2.409.985.615.608.988 1.443.988 2.365v6.365c0 .232.1.448.252.595a.864.864 0 0 0 1.182 0 .82.82 0 0 0 .252-.595v-6.365c.007-2.745-2.267-5.008-5.078-5.013Zm16.758 1.792a6.226 6.226 0 0 1 1.713 4.3 6.236 6.236 0 0 1-1.713 4.299c-1.056 1.113-2.532 1.815-4.174 1.815-1.627 0-3.105-.704-4.166-1.816a6.24 6.24 0 0 1 0-8.598c1.061-1.111 2.54-1.815 4.166-1.815 1.642.002 3.118.704 4.174 1.815Zm.023 4.3c0-1.237-.483-2.36-1.25-3.17-.771-.812-1.813-1.307-2.949-1.307-1.133 0-2.18.497-2.949 1.307a4.608 4.608 0 0 0-1.25 3.17 4.56 4.56 0 0 0 1.25 3.155c.77.808 1.816 1.295 2.95 1.295 1.132 0 2.181-.488 2.948-1.295a4.56 4.56 0 0 0 1.25-3.154Zm18.194-6.02-.005-.003-.004-.002a.78.78 0 0 0-.303-.065.9.9 0 0 0-.462.136.844.844 0 0 0-.329.377v.005l-3.22 8.692-2.48-5.825-.005-.003a.845.845 0 0 0-.335-.377.883.883 0 0 0-.947.002.845.845 0 0 0-.331.375l-.002.003-2.486 5.83-3.233-8.69h-.002a.746.746 0 0 0-.308-.387.905.905 0 0 0-.469-.138.806.806 0 0 0-.317.065h-.005l-.004.004a.84.84 0 0 0-.487.762c0 .101.02.202.06.303l3.98 10.547v.005a.79.79 0 0 0 .14.233.602.602 0 0 0 .186.138c.014.011.033.03.066.048a.33.33 0 0 0 .118.041c.07.023.166.058.292.058.16 0 .31-.058.445-.143a.772.772 0 0 0 .299-.366l.009-.007 2.518-5.938 2.52 5.913h.002c.058.159.161.28.278.368.125.092.265.15.412.173h.105c.1 0 .198-.019.28-.05a.85.85 0 0 0 .214-.12.958.958 0 0 0 .306-.399v-.004l3.954-10.501a.816.816 0 0 0-.45-1.06Z" clipRule="evenodd"/>
              </svg>
            </div>
            
            {/* Divider */}
            <div className="si-header-divider"></div>
            
            {/* Brand logo */}
            {logoUrl && (
              <div className="si-header-brand">
                <img src={logoUrl} alt="Brand Logo" className="si-header-brand-logo" />
              </div>
            )}
          </div>
          
          <div className="si-header-actions">
            {/* Start Over Button */}
            <button 
              className="si-start-over-btn"
              onClick={onStartOver}
              title="Start Over"
            >
              <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
                <path d="M14 8a6 6 0 0 1-11.001 3.316v2.608h-1v-3.809a.5.5 0 0 1 .5-.5h3.809v1h-2.57A5 5 0 0 0 13 8zM8 1.999a6 6 0 0 1 5.001 2.686V2.076h1v3.809a.5.5 0 0 1-.5.5H9.692v-1h2.57A5.002 5.002 0 0 0 2.999 8h-1c0-3.314 2.687-6 6.001-6.001" />
              </svg>
            </button>
            
            {/* Dark/Light Mode Toggle */}
            <button 
              className="si-theme-toggle"
              onClick={() => setIsDarkMode(!isDarkMode)}
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? (
                // Sun icon for light mode
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M12 3a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm0 15a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm9-6a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1ZM5 12a1 1 0 0 1-1 1H3a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1Zm14.07-5.66a1 1 0 0 1 0 1.41l-.71.71a1 1 0 1 1-1.41-1.41l.71-.71a1 1 0 0 1 1.41 0ZM7.05 17.66a1 1 0 0 1 0 1.41l-.71.71a1 1 0 1 1-1.41-1.41l.71-.71a1 1 0 0 1 1.41 0Zm12.02.71a1 1 0 0 1-1.41 0l-.71-.71a1 1 0 1 1 1.41-1.41l.71.71a1 1 0 0 1 0 1.41ZM6.34 7.05a1 1 0 0 1-1.41 0l-.71-.71a1 1 0 0 1 1.41-1.41l.71.71a1 1 0 0 1 0 1.41ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/>
                </svg>
              ) : (
                // Moon icon for dark mode
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M12.1 22c-5.5 0-10-4.5-10-10 0-4.8 3.4-8.8 8-9.8.8-.2 1.4.6 1.1 1.4-.9 2.5-.2 5.4 1.9 7.4 2.1 2.1 5 2.8 7.4 1.9.7-.3 1.5.3 1.4 1.1-1 4.6-5 8-9.8 8Zm-6.9-9.8c.4 3.9 3.6 7 7.6 7.2 1.6.1 3.1-.3 4.4-1-2.3-.7-4.3-2.2-5.6-4.3-1.3-2.1-1.7-4.5-1.3-6.7-2.9 1-5 3.6-5.1 6.8Z"/>
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* Messages area */}
        <div className="si-messages-container">
          {/* Welcome state */}
          {chatHistory.length === 0 && !isStreaming && (
            <div className="si-welcome">
              <h2 className="si-welcome-title">{getGreeting()}</h2>
              <p className="si-welcome-subtitle">What insights can I help you discover today?</p>
            </div>
          )}

          {/* Chat messages */}
          <div className="si-messages">
            {chatHistory.map((msg) => (
              <div
                key={msg.id}
                className={`si-message ${msg.role} ${msg.isError ? 'error' : ''}`}
              >
                {msg.role === 'user' ? (
                  <div className="si-user-message">
                    <div className="si-user-content" style={{ backgroundColor: brandColor }}>
                      {msg.content}
                    </div>
                    <div className="si-message-toolbar user">
                      <button 
                        className="si-toolbar-btn"
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        title="Copy"
                      >
                        {copiedMessageId === msg.id ? (
                          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                            <path d="m13.86 4.847-7.214 7.5a.5.5 0 0 1-.702.018l-4.285-4 .682-.73 3.926 3.663 6.873-7.145z" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                            <path fillRule="evenodd" d="M10.5 2A1.5 1.5 0 0 1 12 3.5V5h.5A1.5 1.5 0 0 1 14 6.5v6a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 5 12.5V12H3.5A1.5 1.5 0 0 1 2 10.5v-7A1.5 1.5 0 0 1 3.5 2zm-4 4a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5v-6a.5.5 0 0 0-.5-.5zm-3-3a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5H5V6.5A1.5 1.5 0 0 1 6.5 5H11V3.5a.5.5 0 0 0-.5-.5z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="si-assistant-message">
                    {/* Thinking section */}
                    {msg.thinking && (
                      <div className="si-thinking-section">
                        <button 
                          className="si-thinking-toggle"
                          onClick={() => toggleThinking(msg.id)}
                        >
                          <span className="si-thinking-status">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--si-success)">
                              <path d="M8 1.5c-2.4 2.4-5 3-6 3C2.5 11 5 14 8 14c3.5 0 6-6 6-9-2-.5-5-2.333-6-3.5" />
                              <path d="M11.207 6.5 7.922 9.785a.5.5 0 0 1-.69.016L5.293 8.032l.674-.738L7.553 8.74 10.5 5.793z" />
                            </svg>
                            Thinking completed
                          </span>
                          <svg 
                            viewBox="0 0 16 16" 
                            width="16" 
                            height="16" 
                            fill="currentColor"
                            className={`si-chevron ${expandedThinking[msg.id] ? 'expanded' : ''}`}
                          >
                            <path d="m2.646 10.147 5-5a.5.5 0 0 1 .708 0l5 5-.707.707L8 6.207l-4.646 4.647z" />
                          </svg>
                        </button>
                        
                        {expandedThinking[msg.id] && (
                          <div className="si-thinking-content">
                            {renderFormattedText(msg.thinking)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Response content */}
                    <div className="si-assistant-content">
                      {renderFormattedText(msg.content)}
                    </div>

                    {/* Charts */}
                    {msg.charts && msg.charts.length > 0 && (
                      <div className="si-charts-container">
                        {msg.charts.map((chart, idx) => (
                          <div key={idx} className="si-chart-wrapper">
                            {chart.title && (
                              <h4 className="si-chart-title">{chart.title}</h4>
                            )}
                            <VegaChart 
                              spec={chart} 
                              id={`chart-${msg.id}-${idx}`}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Toolbar */}
                    <div className="si-message-toolbar assistant">
                      <button 
                        className="si-toolbar-btn"
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        title="Copy"
                      >
                        {copiedMessageId === msg.id ? (
                          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                            <path d="m13.86 4.847-7.214 7.5a.5.5 0 0 1-.702.018l-4.285-4 .682-.73 3.926 3.663 6.873-7.145z" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                            <path fillRule="evenodd" d="M10.5 2A1.5 1.5 0 0 1 12 3.5V5h.5A1.5 1.5 0 0 1 14 6.5v6a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 5 12.5V12H3.5A1.5 1.5 0 0 1 2 10.5v-7A1.5 1.5 0 0 1 3.5 2zm-4 4a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5v-6a.5.5 0 0 0-.5-.5zm-3-3a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5H5V6.5A1.5 1.5 0 0 1 6.5 5H11V3.5a.5.5 0 0 0-.5-.5z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                      <button className="si-toolbar-btn" title="Helpful">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                          <path fillRule="evenodd" clipRule="evenodd" d="M5.976 7 8.38 2.67a1.59 1.59 0 0 1 2.932 1.156L10.768 6h2.773a2 2 0 0 1 1.98 2.283l-.387 2.712A3.5 3.5 0 0 1 11.669 14H3.77a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm3.278-3.845a.59.59 0 0 1 1.086.429l-.697 2.795a.5.5 0 0 0 .485.621h3.413a1 1 0 0 1 .99 1.142l-.387 2.712A2.5 2.5 0 0 1 11.669 13H6.77V7.63zM5.77 8h-2v5h2z" />
                        </svg>
                      </button>
                      <button className="si-toolbar-btn" title="Not helpful">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                          <path fillRule="evenodd" clipRule="evenodd" d="m10.795 9-2.403 4.33a1.59 1.59 0 0 1-2.932-1.155L6.003 10H3.23a2 2 0 0 1-1.98-2.283l.387-2.712A3.5 3.5 0 0 1 5.102 2H13a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1zm-3.278 3.845a.59.59 0 0 1-1.087-.428l.698-2.796A.5.5 0 0 0 6.643 9H3.23a1 1 0 0 1-.99-1.141l.387-2.713A2.5 2.5 0 0 1 5.102 3H10v5.37zM13 8h-2V3h2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Streaming response */}
            {isStreaming && (currentResponse || currentThinking || currentStatus) && (
              <div className="si-message assistant streaming">
                <div className="si-assistant-message">
                  {/* Status indicator */}
                  {currentStatus && (
                    <div className="si-status-indicator">
                      <span className="si-thinking-spinner"></span>
                      {currentStatus}
                    </div>
                  )}

                  {/* Thinking section */}
                  {currentThinking && (
                    <div className="si-thinking-section streaming">
                      <div className="si-thinking-toggle loading">
                        <span className="si-thinking-status">
                          <span className="si-thinking-spinner"></span>
                          Thinking...
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Streaming content */}
                  {currentResponse && (
                    <div className="si-assistant-content">
                      {renderFormattedText(currentResponse)}
                      <span className="si-cursor">▌</span>
                    </div>
                  )}

                  {/* Streaming charts */}
                  {currentCharts.length > 0 && (
                    <div className="si-charts-container">
                      {currentCharts.map((chart, idx) => (
                        <div key={idx} className="si-chart-wrapper">
                          {chart.title && (
                            <h4 className="si-chart-title">{chart.title}</h4>
                          )}
                          <VegaChart 
                            spec={chart} 
                            id={`streaming-chart-${idx}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Loading indicator (no content yet) */}
            {isStreaming && !currentResponse && !currentThinking && !currentStatus && (
              <div className="si-message assistant loading">
                <div className="si-assistant-message">
                  <div className="si-thinking-section">
                    <div className="si-thinking-toggle loading">
                      <span className="si-thinking-status">
                        <span className="si-thinking-spinner"></span>
                        Connecting...
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="si-input-container">
          {error && (
            <div className="si-error-banner">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m9-3v4.5H7V5zm0 6v1.5H7V11z" />
              </svg>
              {error}
            </div>
          )}
          
          <div className="si-input-wrapper">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Snowflake Intelligence..."
              disabled={isStreaming}
              className="si-textarea"
              rows={1}
            />
            <div className="si-input-actions">
              <div className="si-input-left">
                <span className="si-agent-label">
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                    <path d="M7.403 4.449A4.77 4.77 0 0 0 2 4.61v7.41a5.36 5.36 0 0 1 5.5-.052V4.51zM14 4.505a4.98 4.98 0 0 0-5.332-.088l-.168.101v7.474a5.56 5.56 0 0 1 5.5-.034zm1 7.987c0 .568-.639.9-1.104.576a4.57 4.57 0 0 0-4.994-.153l-.641.392-.269.163-.263-.17-.573-.37a4.36 4.36 0 0 0-5.036.221.694.694 0 0 1-1.12-.548V4.462c0-.22.101-.427.274-.562l.184-.137a5.77 5.77 0 0 1 6.487-.155l.062.04.14-.085a5.98 5.98 0 0 1 6.545.2.72.72 0 0 1 .308.59z" />
                  </svg>
                  {mainVertical}
                </span>
              </div>
              <button
                onClick={handleSubmit}
                disabled={isStreaming || !inputValue.trim()}
                className="si-send-btn"
                style={{ backgroundColor: brandColor }}
              >
                {isStreaming ? (
                  <span className="si-send-spinner"></span>
                ) : (
                  <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
                    <path d="M1.724 1.053a.5.5 0 0 0-.714.545l1.403 4.85a.5.5 0 0 0 .397.354l5.69.95c.373.063.373.593 0 .655l-5.69.95a.5.5 0 0 0-.397.354l-1.403 4.85a.5.5 0 0 0 .714.546l13-6.5a.5.5 0 0 0 0-.894z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          
          <p className="si-disclaimer">
            Agents can make mistakes. Double-check important information.
          </p>
          
          {/* Suggested questions - always visible */}
          {defaultQuestions.length > 0 && (
            <div className="si-suggested-questions">
              <p className="si-suggested-label">Try asking:</p>
              <div className="si-suggested-grid">
                {defaultQuestions.map((question, index) => (
                  <button
                    key={index}
                    className="si-suggested-btn"
                    onClick={() => handleSuggestedQuestion(question)}
                    style={{ '--accent-color': brandColor }}
                  >
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" className="si-suggested-icon">
                      <path d="M8 1a7 7 0 1 0 4.95 11.95l.707.707A8 8 0 1 1 8 0v1z"/>
                      <path d="M8 4.5a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3V5a.5.5 0 0 1 .5-.5z"/>
                    </svg>
                    <span className="si-suggested-text">{question}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default ChatPage;
