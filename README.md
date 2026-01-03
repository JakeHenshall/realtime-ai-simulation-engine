# Real-time AI Simulation Engine

A Next.js application for running real-time AI-powered simulation sessions with scenario presets, session analysis, and comprehensive metrics tracking.

## Architecture

### Overview

The application is built on Next.js 16 with a modular architecture that separates concerns across multiple layers:

- **Frontend**: React 19 with Next.js App Router for server and client components
- **Backend**: Next.js API routes handling REST endpoints and Server-Sent Events (SSE)
- **Database**: Prisma ORM with SQLite (configurable to PostgreSQL)
- **Caching & Queues**: Redis for real-time pub/sub and rate limiting
- **AI Integration**: Multi-provider LLM support (OpenAI, Anthropic) with streaming capabilities
- **Authentication**: JWT-based token authentication
- **Real-time**: Redis pub/sub with SSE for live simulation updates

### Core Components

#### Database Layer

- **Prisma Schema**: Defines models for `SimulationSession`, `SimulationMessage`, `SessionMetrics`, `SessionAnalysis`, and `ScenarioPreset`
- **Repository Pattern**: Session repository abstracts database operations
- **SQLite Default**: Uses SQLite for local development, easily configurable for PostgreSQL

#### API Layer

- **REST Endpoints**: Standard CRUD operations for sessions, presets, analytics
- **Streaming Endpoints**: SSE endpoints for real-time session updates
- **Rate Limiting**: Redis-based rate limiting for API, AI, and simulation creation
- **Middleware**: Request ID tracking, API wrappers, error handling

#### AI Integration

- **Provider Factory**: Pluggable LLM provider system (OpenAI, Anthropic)
- **Streaming Support**: Real-time token streaming for chat interactions
- **Caching**: Redis-based response caching for AI requests
- **Prompt Composition**: Dynamic system and user prompt building

#### Real-time System

- **Redis Pub/Sub**: Event publishing for simulation updates
- **SSE Streams**: Server-Sent Events for client-side real-time updates
- **Session Management**: State tracking (PENDING, ACTIVE, PAUSED, COMPLETED, ERROR)

#### Analysis & Metrics

- **Background Jobs**: In-process queue for session analysis
- **Metrics Calculation**: Evasiveness, contradiction, sentiment analysis
- **Session Analysis**: Post-session AI-powered analysis and insights

### Data Flow

1. **Session Creation**: User selects a scenario preset → API creates session → Database stores session
2. **Message Flow**: User sends message → API streams to LLM → Response streamed back via SSE
3. **Real-time Updates**: Redis pub/sub publishes events → SSE endpoint broadcasts to connected clients
4. **Analysis**: Session completes → Background job queues analysis → AI analyzes messages → Results stored

## Local Development

### Prerequisites

- Node.js 18+ and npm
- Redis server (for real-time features and rate limiting)
- SQLite (included with Node.js) or PostgreSQL
- LLM API key (OpenAI or Anthropic)

### Setup Steps

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd realtime-ai-simulation-engine
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create a `.env.local` file in the root directory with the following variables:

   ```bash
   # Database
   DATABASE_URL="file:./prisma/dev.db"

   # Redis
   REDIS_URL="redis://localhost:6379"

   # Authentication
   JWT_SECRET="your-secret-key-change-in-production"

   # LLM Provider (choose one)
   LLM_PROVIDER="openai"
   OPENAI_API_KEY="your-openai-api-key"
   OPENAI_BASE_URL="https://api.openai.com/v1"

   # OR
   LLM_PROVIDER="anthropic"
   ANTHROPIC_API_KEY="your-anthropic-api-key"

   # Optional LLM Configuration
   LLM_MODEL="gpt-4"
   LLM_TIMEOUT="30000"

   # Supabase (if using Supabase features)
   NEXT_PUBLIC_SUPABASE_URL="your-supabase-url"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"

   # Application
   NEXT_PUBLIC_BASE_URL="http://localhost:3000"
   LOG_LEVEL="info"
   NODE_ENV="development"
   ```

4. **Initialise the database**

   ```bash
   npm run db:push
   npm run db:seed
   ```

5. **Start Redis** (if not running as a service)

   ```bash
   redis-server
   ```

6. **Start the development server**

   ```bash
   npm run dev
   ```

7. **Access the application**

   Open [http://localhost:3000](http://localhost:3000) in your browser.

### Development Scripts

- `npm run dev` - Start Next.js development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run db:push` - Push Prisma schema to database
- `npm run db:studio` - Open Prisma Studio
- `npm run db:generate` - Generate Prisma client
- `npm run db:seed` - Seed database with initial data

## Vercel Deployment

### Prerequisites

- Vercel account
- GitHub repository (or other Git provider)
- Redis instance (Upstash, Redis Cloud, or self-hosted)
- Database (Vercel Postgres, Supabase, or external PostgreSQL)

### Deployment Steps

1. **Prepare your repository**

   Ensure all code is committed and pushed to your Git repository.

2. **Set up Vercel project**

   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New Project"
   - Import your Git repository
   - Vercel will auto-detect Next.js

3. **Configure environment variables**

   In the Vercel project settings, add all required environment variables:

   - `DATABASE_URL` - Your production database connection string
   - `REDIS_URL` - Your Redis connection URL
   - `JWT_SECRET` - Strong random secret (generate with `openssl rand -base64 32`)
   - `LLM_PROVIDER` - `openai` or `anthropic`
   - `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` - Your LLM API key
   - `OPENAI_BASE_URL` - (Optional) Custom OpenAI endpoint
   - `LLM_MODEL` - (Optional) Default model name
   - `LLM_TIMEOUT` - (Optional) Request timeout in milliseconds
   - `NEXT_PUBLIC_SUPABASE_URL` - (If using Supabase)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - (If using Supabase)
   - `NEXT_PUBLIC_BASE_URL` - Your Vercel deployment URL
   - `LOG_LEVEL` - `info` or `warn` for production
   - `NODE_ENV` - `production`

4. **Configure build settings**

   Vercel will automatically use the `vercel-build` script if it exists in `package.json`, otherwise it uses `npm run build`:

   - Build Command: `npm run vercel-build` (or `npm run build`)
   - Output Directory: `.next`
   - Install Command: `npm install`

   The `vercel-build` script runs `prisma generate && next build` which generates the Prisma client without requiring a database connection.

5. **Set up database migrations**

   **IMPORTANT**: Database migrations MUST be run before the app will work properly. The app requires database tables to exist.

   For production databases, run migrations after the first deployment:

   ```bash
   # Option 1: Via Vercel CLI (recommended)
   vercel env pull .env.local
   npm run db:migrate:deploy
   
   # Option 2: Using the npm script directly (if DATABASE_URL is set)
   npm run db:migrate:deploy
   
   # Option 3: Direct command
   npx prisma migrate deploy
   ```

   **Note**: Migrations are run separately from the build process. The build command (`vercel-build`) only generates the Prisma client and builds the Next.js app. 

   **After running migrations, seed the database:**
   ```bash
   npm run db:seed
   ```

   This will create the initial scenario presets that the app needs to function.

6. **Deploy**

   - Click "Deploy" in Vercel
   - Wait for build to complete
   - Your application will be live at `https://your-project.vercel.app`

7. **Post-deployment**

   - Seed initial data if needed: `npm run db:seed` (run manually or via Vercel CLI)
   - Verify environment variables are set correctly
   - Test real-time features with Redis connection
   - Monitor logs in Vercel dashboard

### Vercel-Specific Considerations

- **Serverless Functions**: API routes run as serverless functions with execution time limits
- **Edge Functions**: Consider using Edge Runtime for better performance on global routes
- **Database Connections**: Use connection pooling for PostgreSQL (Prisma handles this)
- **Redis**: Use Upstash Redis for serverless-compatible Redis
- **File System**: SQLite file system is read-only on Vercel; use external database for production

### Recommended Vercel Add-ons

- **Vercel Postgres**: Managed PostgreSQL database
- **Upstash Redis**: Serverless Redis compatible with Vercel
- **Vercel Analytics**: Monitor performance and usage

## Environment Variables

### Required Variables

| Variable            | Description                            | Example                                                                  |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`      | Database connection string             | `file:./prisma/dev.db` (SQLite) or `postgresql://user:pass@host:5432/db`<br/>**For Supabase on Vercel**: Use connection pooler (port 6543) or transaction pooler (port 5432 with `?pgbouncer=true`) |
| `REDIS_URL`         | Redis connection URL                   | `redis://localhost:6379` or `rediss://user:pass@host:6380`               |
| `JWT_SECRET`        | Secret key for JWT token signing       | Random 32+ character string                                              |
| `LLM_PROVIDER`      | LLM provider to use                    | `openai` or `anthropic`                                                  |
| `OPENAI_API_KEY`    | OpenAI API key (if using OpenAI)       | `sk-...`                                                                 |
| `ANTHROPIC_API_KEY` | Anthropic API key (if using Anthropic) | `sk-ant-...`                                                             |

### Optional Variables

| Variable                        | Description                   | Default                     | Example                           |
| ------------------------------- | ----------------------------- | --------------------------- | --------------------------------- |
| `OPENAI_BASE_URL`               | Custom OpenAI API endpoint    | `https://api.openai.com/v1` | `https://api.openai.com/v1`       |
| `LLM_MODEL`                     | Default LLM model name        | Provider default            | `gpt-4`, `claude-3-opus-20240229` |
| `LLM_TIMEOUT`                   | LLM request timeout (ms)      | Provider default            | `30000`                           |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL          | -                           | `https://xxx.supabase.co`         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key        | -                           | `eyJ...`                          |
| `NEXT_PUBLIC_BASE_URL`          | Public base URL for API calls | `http://localhost:3000`     | `https://your-app.vercel.app`     |
| `LOG_LEVEL`                     | Logging level                 | `info`                      | `debug`, `info`, `warn`, `error`  |
| `NODE_ENV`                      | Node environment              | `development`               | `production`, `development`       |

### Environment Variable Notes

- Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser
- Never commit `.env.local` or `.env` files to version control
- Use Vercel's environment variable interface for production secrets
- Rotate `JWT_SECRET` regularly in production
- Use different API keys for development and production

## Disclaimer

This software is provided "as is" without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software.

### Important Considerations

- **AI Provider Costs**: This application makes API calls to LLM providers (OpenAI, Anthropic). Monitor usage and costs carefully, especially in production environments.
- **Rate Limiting**: Built-in rate limiting helps prevent abuse, but additional measures may be required for high-traffic deployments.
- **Data Privacy**: Session data, messages, and analysis results are stored in the database. Ensure compliance with data protection regulations (GDPR, CCPA, etc.).
- **Authentication**: The current JWT implementation is basic. For production use, integrate with a proper authentication provider (Auth0, Clerk, Supabase Auth, etc.).
- **Database**: SQLite is suitable for development but not recommended for production. Use PostgreSQL or another production-grade database.
- **Redis Dependency**: Real-time features and rate limiting require Redis. Ensure high availability and backup strategies for production.
- **Security**: Review and harden security settings before deploying to production. This includes:
  - Strong JWT secrets
  - Secure API key storage
  - CORS configuration
  - Input validation
  - SQL injection prevention (Prisma helps with this)
- **Scalability**: The current architecture may require adjustments for high-scale deployments. Consider:
  - Database connection pooling
  - Redis clustering
  - Load balancing
  - CDN for static assets
- **Monitoring**: Implement proper logging, error tracking (Sentry, etc.), and monitoring (Vercel Analytics, etc.) for production deployments.

Use this software responsibly and in accordance with the terms of service of all third-party services (OpenAI, Anthropic, Vercel, etc.).
