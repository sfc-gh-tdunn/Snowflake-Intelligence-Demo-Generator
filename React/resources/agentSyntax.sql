CREATE OR REPLACE AGENT my_agent1
  COMMENT = 'Custom Agent for Demo'
  PROFILE = '{"display_name": "My Business Assistant", "avatar":  "business-icon.png", "color": "blue"}'
  FROM SPECIFICATION
  $$
  models:
    orchestration: claude-4-sonnet

  orchestration:
    budget:
      seconds: 30
      tokens: 16000

  instructions:
    response: "You will respond in a friendly but concise manner"
    orchestration: "For any revenue question use Analyst; for policy use Search"
    system: "You are a friendly agent that helps with business questions"
    sample_questions:
      - question: "What was our revenue last quarter?"
        answer: "I'll analyze the revenue data using our financial database."

  tools:
    - tool_spec:
        type: "cortex_analyst_text_to_sql"
        name: "Analyst1"
        description: "Converts natural language to SQL queries for financial analysis"
    - tool_spec:
        type: "cortex_search"
        name: "Search1"
        description: "Searches company policy and documentation"

  tool_resources:
    Analyst1:
      semantic_view: "db.schema.semantic_view"
    Search1:
      name: "db.schema.service_name"
      max_results: "5"
      filter:
        "@eq":
          region: "North America"
      title_column: "<title_name>"
      id_column: "<column_name>"
  $$;