# Snowflake Intelligence Demo Generator - React App

A React-based application for generating personalized Snowflake Intelligence demos with company branding.

## Features

- 🎨 **Brand Integration**: Fetches company logos and colors via Brandfetch API
- 🤖 **AI-Powered Questions**: Generates discovery questions using Raven Sales Assistant
- 💬 **Interactive Chat**: Streaming chat interface with Snowflake Agent APIs
- 🏢 **Multi-Vertical Support**: Financial Services, Healthcare, Manufacturing, Retail, and more
- 🐳 **Container-Ready**: Docker support with runtime environment configuration

## Prerequisites

- Node.js 18+
- npm or yarn
- Docker (for containerized deployment)

## Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Copy `.env.example` to create your local config, then edit `public/env-config.js`:
   ```javascript
   window.__ENV__ = {
     BRANDFETCH_TOKEN: "your_token_here",
     // ... other tokens
   };
   ```

3. **Start development server:**
   ```bash
   npm start
   ```
   
   App will be available at http://localhost:3000

### Docker Deployment

1. **Build the image:**
   ```bash
   docker build -t demo-generator .
   ```

2. **Run with environment variables:**
   ```bash
   docker run -p 8080:8080 \
     -e BRANDFETCH_TOKEN=your_token \
     -e SNOWHOUSE_AUTH_TOKEN=your_token \
     # ... other environment variables
     demo-generator
   ```

3. **Or use docker-compose:**
   ```bash
   # Create .env file with your tokens
   cp .env.example .env
   # Edit .env with your values
   
   docker-compose up -d
   ```
   
   App will be available at http://localhost:8080

## Project Structure

```
React/
├── public/
│   ├── index.html
│   └── env-config.js       # Runtime environment config
├── src/
│   ├── components/
│   │   ├── FormPage.jsx    # Initial form for company info
│   │   ├── BrandSelectionPage.jsx  # Logo/color selection
│   │   └── ChatPage.jsx    # Chat interface
│   ├── services/
│   │   ├── brandfetch.js   # Brandfetch API integration
│   │   ├── ravenAgent.js   # Raven Agent API for questions
│   │   └── snowflakeAgent.js  # Snowflake Agent chat API
│   ├── config/
│   │   └── endpoints.js    # API endpoint configuration
│   ├── styles/
│   │   └── App.css         # Application styles
│   ├── App.jsx
│   └── index.jsx
├── Dockerfile
├── docker-compose.yml
├── docker-entrypoint.sh    # Runtime env var injection
├── nginx.conf
└── package.json
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BRANDFETCH_TOKEN` | API token for Brandfetch |
| `SNOWHOUSE_AUTH_TOKEN` | Token for Raven Agent API |
| `RAVEN_AGENT_ENDPOINT` | Raven Agent API endpoint |
| `API_ENDPOINT_*` | Snowflake Agent endpoints per vertical |
| `*_AUTH_TOKEN` | Auth tokens per vertical |

See `.env.example` for complete list.

## Supported Verticals

- **Advertising, Media & Entertainment**
- **Financial Services**
  - Investment Portfolio Analytics
  - Assets Management Advisor
  - Claims Processor
- **Health Services**
  - Clinical Trials
  - Genomics
- **Manufacturing**
  - Predictive Maintenance
  - Supply Chain Assistant
- **Retail**

## Application Flow

1. **Form Page**: User enters company details and selects vertical
2. **Brand Selection**: App fetches brand assets, user selects logo/color
3. **Chat Page**: Interactive chat with Snowflake Intelligence agent

## Deployment to Snowflake SPCS

1. Push the Docker image to your container registry
2. Create a SPCS service with the image
3. Configure environment variables via service specification
4. The app automatically picks up env vars at container startup

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `npm test`
4. Submit a pull request

## License

Internal use only - Snowflake

