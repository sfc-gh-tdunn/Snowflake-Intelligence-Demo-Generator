import streamlit as st
import streamlit.components.v1 as components
import requests
import json
import urllib3
from typing import Generator
from dotenv import load_dotenv

load_dotenv()


urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

selected_logo_url = st.session_state.get("selected_logo", "")
selected_color = st.session_state.get("selected_color", "#29b5e8")

API_ENDPOINT = "https://sfsenorthamerica-tdunn_aws2.snowflakecomputing.com/api/v2/databases/SNOWFLAKE_INTELLIGENCE/schemas/AGENTS/agents/COMPANY_CHATBOT_AGENT_RETAIL:run"

SNOWFLAKE_BEARER_TOKEN = os.getenv("SNOWFLAKE_AUTH_TOKEN")

def call_streaming_api(question: str, chat_history: list) -> Generator[str, None, None]:
    """
    Call Snowflake Agent API with streaming response.
    
    Args:
        question: The user's question
        chat_history: List of previous messages in the conversation
        
    Yields:
        String chunks of the response as they stream in
    """
    # Build messages array for the API (Snowflake Agent format)
    messages = []
    
    # Add chat history (convert to Snowflake Agent format)
    for msg in chat_history[:-1]:  # Exclude the current message (already added)
        content = msg["content"]
        # Convert to Snowflake format if it's a simple string
        if isinstance(content, str):
            content = [{"type": "text", "text": content}]
        messages.append({
            "role": msg["role"],
            "content": content
        })
    
    # Add current question
    messages.append({
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": question
            }
        ]
    })
    
    # Request payload for Snowflake Agent API
    payload = {
        "messages": messages,
        "tool_choice": {
            "type": "auto",
            "name": []
        }
    }
    
    # Headers
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {SNOWFLAKE_BEARER_TOKEN}"
    }
    
    # Make request (verify=False for SSL cert issues - remove in production)
    response = requests.post(
        API_ENDPOINT,
        json=payload,
        headers=headers,
        stream=True,
        timeout=120,
        verify=False
    )
    
    # Check for errors
    if response.status_code != 200:
        error_detail = response.text[:500] if response.text else "No error details"
        raise Exception(f"API error {response.status_code}: {error_detail}")
    
    # Process response - handle both streaming and non-streaming
    buffer = ""
    for chunk in response.iter_content(chunk_size=None, decode_unicode=True):
        if chunk:
            buffer += chunk
            
            # Try to parse complete JSON objects from buffer
            # Handle newline-delimited JSON or SSE format
            while '\n' in buffer:
                line, buffer = buffer.split('\n', 1)
                line = line.strip()
                
                if not line:
                    continue
                
                # Handle SSE format
                if line.startswith('data:'):
                    line = line[5:].strip()
                
                if not line or line == '[DONE]':
                    continue
                
                try:
                    data = json.loads(line)
                    
                    # Extract text from Snowflake Agent response formats
                    text = extract_text_from_response(data)
                    if text:
                        yield text
                        
                except json.JSONDecodeError:
                    # Not valid JSON, might be partial - continue buffering
                    pass
    
    # Process any remaining buffer
    if buffer.strip():
        try:
            data = json.loads(buffer.strip())
            text = extract_text_from_response(data)
            if text:
                yield text
        except json.JSONDecodeError:
            pass


def extract_text_from_response(data: dict) -> str:
    """Extract text content from various Snowflake Agent response formats."""
    
    # Format: {"delta": {"content": "text"}} or {"delta": {"content": [{"type": "text", "text": "..."}]}}
    if 'delta' in data:
        delta = data['delta']
        if isinstance(delta, dict):
            content = delta.get('content', '')
            if isinstance(content, str):
                return content
            elif isinstance(content, list):
                # Content is array of content blocks
                texts = []
                for block in content:
                    if isinstance(block, dict) and block.get('type') == 'text':
                        texts.append(block.get('text', ''))
                return ''.join(texts)
    
    # Format: {"message": {"content": [{"type": "text", "text": "..."}]}}
    if 'message' in data:
        message = data['message']
        if isinstance(message, dict):
            content = message.get('content', [])
            if isinstance(content, list):
                texts = []
                for block in content:
                    if isinstance(block, dict) and block.get('type') == 'text':
                        texts.append(block.get('text', ''))
                return ''.join(texts)
            elif isinstance(content, str):
                return content
    
    # Format: {"choices": [{"delta": {"content": "..."}}]} (OpenAI-like)
    if 'choices' in data and len(data['choices']) > 0:
        choice = data['choices'][0]
        if 'delta' in choice:
            return choice['delta'].get('content', '')
        if 'message' in choice:
            return choice['message'].get('content', '')
        if 'text' in choice:
            return choice['text']
    
    # Format: {"content": "..."} or {"text": "..."}
    if 'content' in data:
        content = data['content']
        if isinstance(content, str):
            return content
        elif isinstance(content, list):
            texts = []
            for block in content:
                if isinstance(block, dict) and block.get('type') == 'text':
                    texts.append(block.get('text', ''))
            return ''.join(texts)
    
    if 'text' in data:
        return data['text']
    
    return ""


st.set_page_config(
    page_title="AI Assistant",
    page_icon=selected_logo_url if selected_logo_url else None,
    layout="centered",
    initial_sidebar_state="collapsed"
)

st.markdown(f"""
  <style>
  /* Override Streamlit's default background */
  .stApp, [data-testid="stAppViewContainer"], [data-testid="stHeader"], .main, .block-container {{
    background-color: {selected_color} !important;
  }}
  html, body, [data-testid="stAppViewBlockContainer"] {{
    background-color: {selected_color} !important;
  }}
  .brand-logo {{
    margin-bottom: 32px;
    margin-top: 32px;
    width: 128px;
    height: auto;
    display: block;
  }}
  .greeting-block {{
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    opacity: 0.98;
    filter: none;
    transition: all 0.2s;
    margin-bottom: 0.5rem;
    width: 100%;
  }}
  .greeting-title {{
    font-size: 1.35rem;
    line-height: 1.2;
    letter-spacing: -0.01em;
    font-weight: 700;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1e252f;
    margin: 0 0 0.25rem 0;
    padding: 0 0.5rem;
    word-break: break-word;
  }}
  .greeting-prompt {{
    font-size: 1.08rem;
    line-height: 1.3;
    letter-spacing: -0.01em;
    font-weight: 600;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #29b5e8;
    margin: 0 0 0.25rem 0;
    padding: 0 0.5rem 0.5rem 0.5rem;
    word-break: break-word;
    background: linear-gradient(90deg, #29b5e8 0%, #6dd5ed 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-fill-color: transparent;
  }}
  .main-content {{
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }}
  </style>
""", unsafe_allow_html=True)

# Initialize chat history
if 'chat_history' not in st.session_state:
    st.session_state.chat_history = []

# Show greeting only if no chat history
if not st.session_state.chat_history:
    if selected_logo_url:
        logo_html = f'<img src="{selected_logo_url}" class="brand-logo" alt="Brand Logo" />'
    else:
        # Placeholder for company logo
        logo_html = '''<div style="width: 128px; height: 128px; border-radius: 16px; background: rgba(255,255,255,0.1); border: 2px dashed rgba(255,255,255,0.3); display: flex; align-items: center; justify-content: center; margin-bottom: 32px; margin-top: 32px;">
<span style="color: rgba(255,255,255,0.5); font-size: 0.85rem; text-align: center; padding: 8px;">Company Logo</span>
</div>'''
    st.markdown(f'''<div class="main-content">
<div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
{logo_html}
<div style="border-radius: 18px; box-shadow: 0 2px 16px rgba(0,0,0,0.08); padding: 2.5rem 2rem; max-width: 420px; width: 100%; display: flex; flex-direction: column; align-items: center; background: white;">
<div class="greeting-block">
<div class="greeting-title">Good morning, Tyler</div>
<div class="greeting-prompt">What insights can I help with?</div>
</div>
</div>
</div>
</div>''', unsafe_allow_html=True)

# Display chat history
for message in st.session_state.chat_history:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# Chat input
if prompt := st.chat_input("Ask Snowflake Intelligence..."):
    # Add user message to history
    st.session_state.chat_history.append({"role": "user", "content": prompt})
    
    # Display user message
    with st.chat_message("user"):
        st.markdown(prompt)
    
    # Display assistant response with streaming
    with st.chat_message("assistant"):
        response_placeholder = st.empty()
        full_response = ""
        
        try:
            # Stream the response
            for chunk in call_streaming_api(prompt, st.session_state.chat_history):
                full_response += chunk
                response_placeholder.markdown(full_response + "▌")
            
            # Final response without cursor
            response_placeholder.markdown(full_response)
            
        except Exception as e:
            error_msg = f"Error calling API: {str(e)}"
            response_placeholder.markdown(error_msg)
            full_response = error_msg
        
        # Add assistant response to history
        st.session_state.chat_history.append({"role": "assistant", "content": full_response})
