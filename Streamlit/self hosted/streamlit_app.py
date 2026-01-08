import streamlit as st
import requests
import os
import re
import json
from dotenv import load_dotenv

load_dotenv()

BRANDFETCH_BEARER_TOKEN = os.getenv("BRANDFETCH_TOKEN")

st.set_page_config(
    page_title="Snowflake Intelligence Demo Generator",
)

def main():
    st.title("Company Branding Selector")
    if 'page' not in st.session_state:
        st.session_state.page = 'form'
    if 'brand_data' not in st.session_state:
        st.session_state.brand_data = None
    if 'selected_logo' not in st.session_state:
        st.session_state.selected_logo = None
    if 'selected_color' not in st.session_state:
        st.session_state.selected_color = None
    if 'name' not in st.session_state:
        st.session_state.name = None
    if 'generated_file' not in st.session_state:
        st.session_state.generated_file = None

    if st.session_state.page == 'form':
        # Define sub_vertical options for each main vertical
        sub_vertical_options = {
            "Health Services": ["Clinical Trials", "Genomics"],
            # "Health Services": ["Cost of Care", "Population Health", "Clinical Trials", "Genomics"],
            "Financial Services": ["Investment Portfolio Analytics", "Assets Management Advisor", "Claims Processor"],
            "Manufacturing": ["Supply Chain Assistant", "Predictive Maintenance"],
        }
        
        # Main vertical selector outside form so it can trigger dynamic updates
        main_vertical = st.selectbox(
            "Company Vertical", 
            options=["Advertising, Media & Entertainment", "Financial Services", "Health Services", "Manufacturing", "Retail", "Custom"]
        )
        
        # Conditionally show sub_vertical dropdown
        sub_vertical = None
        if main_vertical in sub_vertical_options:
            sub_vertical = st.selectbox("Sub Vertical", options=sub_vertical_options[main_vertical])
        
        with st.form("input_form"):
            name = st.text_input("Name", max_chars=100)
            company_url = st.text_input("Company URL (ex. www.snowflake.com)", max_chars=200)
            team_members = st.text_input("Team Members/Audience", max_chars=200)
            use_cases = st.text_area("Specific Use Cases (optional)")
            records_per_table = st.number_input("Records per table (optional)", min_value=1, value=1000)
            submitted = st.form_submit_button("Submit")

        if submitted:
            if not name or not company_url or not team_members or not main_vertical:
                st.error("Please fill in all required fields.")
                return
            st.session_state.name = name    
            st.session_state.main_vertical = main_vertical
            st.session_state.sub_vertical = sub_vertical
            # Call Brandfetch API
            fetch_brand_data(company_url)
            # Call Raven Agent API with spinner for long wait
            with st.spinner("Contacting Raven Agent (may take up to 1 minute)..."):
                questions = call_raven_agent(company_url)
            st.session_state.raven_questions = questions
            # Comment out rerun for debugging
            st.session_state.page = 'select_brand'
            st.rerun()  # Re-enable rerun to show the next page after questions are fetched
    elif st.session_state.page == 'select_brand':
        show_brand_options(st.session_state.brand_data)
    elif st.session_state.page == 'final':
        show_final_page(st.session_state.selected_logo, st.session_state.selected_color, st.session_state.generated_file)

def generate_branded_app(logo_url, color_hex, name):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    template_path = os.path.join(script_dir, "brand_landing_app_template.py")
    
    safe_name = re.sub(r'[^\w\-]', '_', name.lower().strip())
    safe_name = re.sub(r'_+', '_', safe_name).strip('_') or 'brand'
    output_filename = f"brand_landing_app_{safe_name}.py"
    output_path = os.path.join(script_dir, output_filename)
    
    with open(template_path, 'r') as f:
        template_content = f.read()
    
    modified_content = re.sub(
        r'selected_logo_url\s*=\s*st\.session_state\.get\("selected_logo",\s*""\)',
        f'selected_logo_url = "{logo_url}"',
        template_content
    )
    
    modified_content = re.sub(
        r'selected_color\s*=\s*st\.session_state\.get\("selected_color",\s*"#29b5e8"\)',
        f'selected_color = "{color_hex}"',
        modified_content
    )

    # Determine which API endpoint value to use based on main_vertical and sub_vertical
    main_vertical = st.session_state.get('main_vertical', '').strip()
    sub_vertical = (st.session_state.get('sub_vertical') or '').strip()
    
    # Granular endpoint mapping: (main_vertical, sub_vertical) -> endpoint_var
    sub_vertical_endpoint_map = {
        ('Financial Services', 'Investment Portfolio Analytics'): 'API_ENDPOINT_FIN_INVESTMENT_PORTFOLIO_ANALYTICS',
        ('Financial Services', 'Assets Management Advisor'): 'API_ENDPOINT_FIN_ASSETS_MANAGEMENT_ADVISOR',
        ('Financial Services', 'Claims Processor'): 'API_ENDPOINT_FIN_CLAIMS_PROCESSOR',
        # ('Health Services', 'Cost of Care'): 'API_ENDPOINT_HS_COST_OF_CARE',
        # ('Health Services', 'Population Health'): 'API_ENDPOINT_HS_POPULATION_HEALTH',
        ('Health Services', 'Clinical Trials'): 'API_ENDPOINT_HS_CLINCIAL_TRIALS',
        ('Health Services', 'Genomics'): 'API_ENDPOINT_HS_GENOMICS',
        ('Manufacturing', 'Predictive Maintenance'): 'API_ENDPOINT_MAN_PREDICTIVE_MAINTENANCE',
        ('Manufacturing', 'Supply Chain Assistant'): 'API_ENDPOINT_MAN_SUPPLY_CHAIN_ASSISTANT',
    }
    
    # Fallback endpoint map (main_vertical only)
    endpoint_map = {
        'Retail': 'API_ENDPOINT_RETAIL',
        'Advertising, Media & Entertainment': 'API_ENDPOINT_ADS',
        'Financial Services': 'API_ENDPOINT_FIN_INVESTMENT_PORTFOLIO_ANALYTICS',
        'Health Services': 'API_ENDPOINT_HS_COST_OF_CARE',
        'Manufacturing': 'API_ENDPOINT_MAN_SUPPLY_CHAIN_ASSISTANT',
        'Custom': 'API_ENDPOINT_CUSTOM',
    }
    
    # Granular token mapping: (main_vertical, sub_vertical) -> token_var
    sub_vertical_token_map = {
        ('Financial Services', 'Investment Portfolio Analytics'): 'FIN_INVESTMENT_PORTFOLIO_ANALYTICS_AUTH_TOKEN',
        ('Financial Services', 'Assets Management Advisor'): 'FIN_ASSETS_MANAGEMENT_ADVISOR_AUTH_TOKEN',
        ('Financial Services', 'Claims Processor'): 'FIN_CLAIMS_PROCESSOR_AUTH_TOKEN',
        # ('Health Services', 'Cost of Care'): 'HS_COST_OF_CARE_AUTH_TOKEN',
        # ('Health Services', 'Population Health'): 'HS_POPULATION_HEALTH_AUTH_TOKEN',
        ('Health Services', 'Clinical Trials'): 'HS_CLINICAL_TRIALS_AUTH_TOKEN',
        ('Health Services', 'Genomics'): 'HS_GENOMICS_AUTH_TOKEN',
        ('Manufacturing', 'Predictive Maintenance'): 'MAN_PREDICTIVE_MAINTENANCE_AUTH_TOKEN',
        ('Manufacturing', 'Supply Chain Assistant'): 'MAN_SUPPLY_CHAIN_ASSISTANT_AUTH_TOKEN',
    }
    
    # Fallback token map (main_vertical only)
    token_map = {
        'Retail': 'RETAIL_AUTH_TOKEN',
        'Advertising, Media & Entertainment': 'ADS_AUTH_TOKEN',
        'Financial Services': 'FIN_INVESTMENT_PORTFOLIO_ANALYTICS_AUTH_TOKEN',
        'Health Services': 'HS_CLINICAL_TRIALS_AUTH_TOKEN',
        'Manufacturing': 'MAN_SUPPLY_CHAIN_ASSISTANT_AUTH_TOKEN',
        'Custom': 'SNOWFLAKE_AUTH_TOKEN',
    }
    
    # Try to get endpoint from sub_vertical map first, then fall back to main vertical only
    endpoint_var = sub_vertical_endpoint_map.get((main_vertical, sub_vertical)) or endpoint_map.get(main_vertical, 'API_ENDPOINT_CUSTOM')
    # Get the actual endpoint value from environment variables (loaded via dotenv)
    endpoint_value = os.getenv(endpoint_var, '')
    
    # Try to get token from sub_vertical map first, then fall back to main vertical only
    token_var = sub_vertical_token_map.get((main_vertical, sub_vertical)) or token_map.get(main_vertical, 'SNOWFLAKE_AUTH_TOKEN')
    # Get the actual token value from environment variables
    token_value = os.getenv(token_var, '')
    # Replace the API_ENDPOINT assignment line with the actual endpoint value (if it exists)
    modified_content = re.sub(
        r'^API_ENDPOINT\s*=.*$',
        f'API_ENDPOINT = "{endpoint_value}"',
        modified_content,
        flags=re.MULTILINE
    )
    
    # Replace the SNOWFLAKE_BEARER_TOKEN assignment line with the actual token value
    modified_content = re.sub(
        r'^SNOWFLAKE_BEARER_TOKEN\s*=.*$',
        f'SNOWFLAKE_BEARER_TOKEN = "{token_value}"',
        modified_content,
        flags=re.MULTILINE
    )

    # Insert the API_ENDPOINT assignment at the top of the template (after selected_color)
    # Note: SNOWFLAKE_BEARER_TOKEN is already replaced above via regex, so we only insert API_ENDPOINT
    api_endpoint_line = f'API_ENDPOINT = "{endpoint_value}"'
    insert_block = f'\n{api_endpoint_line}\n'
    # Find where to insert (after selected_color)
    selected_color_pattern = r'(selected_color\s*=.*)'
    match = re.search(selected_color_pattern, modified_content)
    if match:
        insert_at = match.end()
        modified_content = modified_content[:insert_at] + insert_block + modified_content[insert_at:]
    else:
        # fallback: insert at the top
        modified_content = insert_block + modified_content

    # Embed Top 5 Discovery Questions as static content in sidebar if available
    questions = st.session_state.get('raven_questions', [])
    questions_code = ''
    if questions:
        questions_code = '\nwith st.sidebar:\n    st.markdown("""<h3 style=\"color: #29b5e8; margin-top: 0;\">Top 5 Discovery Questions</h3>""", unsafe_allow_html=True)\n    with st.expander("Show/Hide Questions", expanded=False):\n        st.markdown("<ol>", unsafe_allow_html=True)\n'
        for q in questions:
            questions_code += f'        st.markdown("<li style=\\"margin-bottom: 0.75rem; font-size: 1.08rem;\\">{q}</li>", unsafe_allow_html=True)\n'
        questions_code += '        st.markdown("</ol>", unsafe_allow_html=True)\n'
    # Insert the questions code after the logo/color setup
    insert_point = 'st.markdown(f"""\n  <style>'
    if insert_point in modified_content:
        modified_content = modified_content.replace(insert_point, questions_code + '\n' + insert_point)
    else:
        modified_content = questions_code + '\n' + modified_content
    # Write the new file
    with open(output_path, 'w') as f:
        f.write(modified_content)
    
    return output_path


def fetch_brand_data(company_url):
    api_url = f"https://api.brandfetch.io/v2/brands/{company_url}"
    headers = {
        "Authorization": f"Bearer {BRANDFETCH_BEARER_TOKEN}"
    }
    with st.spinner("Fetching brand data..."):
        response = requests.get(api_url, headers=headers)
        if response.status_code == 200:
            data = response.json()
            st.session_state.brand_data = data
        else:
            st.error(f"Failed to fetch brand data. Status code: {response.status_code}")

def show_brand_options(data):
    logos = data.get("logos", [])[:3]
    colors = data.get("colors", [])[:3]
    # Layout: left column for Raven questions, right for logo/color selection
    col1, col2 = st.columns([1,2])
    with col1:
        st.subheader("Top 5 Discovery Questions")
        questions = st.session_state.get("raven_questions", [])
        if questions:
            for i, q in enumerate(questions, 1):
                st.markdown(f"**{i}.** {q}")
        else:
            st.info("Questions will appear here after submission.")
    with col2:
        st.subheader("Select a Logo")
        logo_urls = [logo.get("formats", [{}])[0].get("src", "") for logo in logos]
        selected_logo = st.radio("Choose a logo:", logo_urls, format_func=lambda x: x, key="logo_radio")
        for url in logo_urls:
            st.image(url, width=100)
        st.subheader("Select a Color")
        color_hexes = [color.get("hex", "#000000") for color in colors]
        selected_color = st.radio("Choose a color:", color_hexes, key="color_radio")
        for hex_code in color_hexes:
            st.markdown(f'<div style="width:50px;height:25px;background:{hex_code};display:inline-block;margin-right:10px;"></div>', unsafe_allow_html=True)
        if st.button("Finalize Selection"):
            st.session_state.selected_logo = selected_logo
            st.session_state.selected_color = selected_color
            generated_file = generate_branded_app(selected_logo, selected_color, st.session_state.name)
            st.session_state.generated_file = generated_file
            st.session_state.page = 'final'
            st.rerun()
def call_raven_agent(company_url):
    """
    Calls the Raven Sales Assistant Agent API and returns the top 5 questions as a list.
    Handles streaming (SSE or chunked) responses and extracts only the final questions block.
    """
    API_ENDPOINT = "https://SFCOGSOPS-SNOWHOUSE_AWS_US_WEST_2.snowflakecomputing.com/api/v2/databases/SNOWFLAKE_INTELLIGENCE/schemas/AGENTS/agents/RAVEN_SALES_ASSISTANT:run"
    SNOWHOUSE_BEARER_TOKEN = os.getenv("SNOWHOUSE_AUTH_TOKEN")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {SNOWHOUSE_BEARER_TOKEN}"
    }
    payload = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"Please review the company  {company_url} and identify their main industry, goal, and any recent major news. With this company profile, review and determine the most important Snowflake intelligence use case for that company. Return one list of the top 5 questions typical of that use case. Do not return anything besides those top questions. Always start your response with 'Here are your questions:'"
                    }
                ]
            }
        ],
        "tool_choice": {
            "type": "auto",
            "name": []
        }
    }
    try:
        response = requests.post(
            API_ENDPOINT,
            headers=headers,
            data=json.dumps(payload),
            timeout=60,
            verify=False,
            stream=True
        )
        if response.status_code != 200:
            st.error(f"Raven Agent API error: {response.status_code}\nResponse: {response.text}")
            return [f"API error: {response.status_code}"]
        # Process streaming response, only collect from 'event: response.text' lines
        questions_text = ""
        for line in response.iter_lines(decode_unicode=True):
            if not line:
                continue
            if line.startswith('event:'):
                current_event = line.split(':', 1)[1].strip()
                continue
            if line.startswith('data:') and 'current_event' in locals() and current_event == 'response.text':
                data_str = line[5:].strip()
                try:
                    data_json = json.loads(data_str)
                    questions_text += data_json.get('text', '') + "\n"
                except Exception:
                    continue
        # Now extract questions from questions_text
        questions = []
        if questions_text:
            matches = re.findall(r"\d+\.\s+\*\*(.*?)\*\*", questions_text)
            if not matches:
                # fallback: try to extract numbered lines
                matches = re.findall(r"\d+\.\s+(.*?)\n", questions_text)
            for q in matches:
                if q.strip():
                    questions.append(q.strip())
        if not questions:
            st.error("No valid questions found in streaming response.")
            return ["No questions found in response."]
        return questions[:5]
    except Exception as e:
        st.error(f"Error calling Raven Agent: {str(e)}")
        return [f"Error calling Raven Agent: {str(e)}"]

def show_final_page(logo_url, color_hex, generated_file):
    st.markdown(f'<div style="background:{color_hex};padding:30px;text-align:center;">', unsafe_allow_html=True)
    st.image(logo_url, width=200)
    st.markdown("</div>", unsafe_allow_html=True)
    st.write("\n\n")
    st.success("Your branded landing page has been generated!")
    
    if generated_file:
        st.write(f"**Generated file:** `{os.path.basename(generated_file)}`")
        st.write(f"**Full path:** `{generated_file}`")
        st.info("You can run this file with: `streamlit run " + os.path.basename(generated_file) + "`")
    
    if st.button("Start Over"):
        for key in ["page", "brand_data", "selected_logo", "selected_color", "logo_radio", "color_radio", "name", "generated_file"]:
            if key in st.session_state:
                del st.session_state[key]
        st.rerun()

if __name__ == "__main__":
    main()
