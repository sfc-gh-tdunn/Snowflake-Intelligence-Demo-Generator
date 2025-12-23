import streamlit as st
import requests
import os
import re
from dotenv import load_dotenv

load_dotenv()

BRANDFETCH_BEARER_TOKEN = os.getenv("BRANDFETCH_TOKEN")


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
            "Health Services": ["Cost of Care", "Population Health", "Clinical Trials", "Genomics"],
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
            company_url = st.text_input("Company URL", max_chars=200)
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
            fetch_brand_data(company_url)
    elif st.session_state.page == 'select_brand':
        show_brand_options(st.session_state.brand_data)
    elif st.session_state.page == 'final':
        show_final_page(st.session_state.selected_logo, st.session_state.selected_color, st.session_state.generated_file)

def generate_branded_app(logo_url, color_hex, name):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    template_path = os.path.join(script_dir, "brand_landing_app_template.py")
    
    safe_name = re.sub(r'[^\w\-]', '_', name.lower().strip())
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
            st.session_state.page = 'select_brand'
            st.rerun()
        else:
            st.error(f"Failed to fetch brand data. Status code: {response.status_code}")

def show_brand_options(data):
    logos = data.get("logos", [])[:3]
    colors = data.get("colors", [])[:3]
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
