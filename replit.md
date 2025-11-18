# SoVoice AI - Voice Call Assistant Platform

## Overview

SoVoice AI is an AI-powered voice call assistant platform designed to automate customer phone interactions. The application provides real-time conversation management, call analytics, and agent configuration capabilities. Built as a full-stack SaaS platform, it enables businesses to handle inbound and outbound calls using AI agents with customizable behavior and voice characteristics.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- **React 18** with TypeScript for type-safe component development
- **Vite** as the build tool and development server
- **Wouter** for lightweight client-side routing
- **TanStack Query (React Query)** for server state management and data fetching
- **Tailwind CSS** with shadcn/ui component library for styling

**Design System:**
- Custom theme system with light/dark mode support
- Professional, enterprise-focused interface inspired by Material Design and Linear/Stripe aesthetics
- Typography using Inter (primary) and JetBrains Mono (monospace) fonts
- Comprehensive design guidelines documented in `design_guidelines.md`
- Responsive layout with sidebar navigation pattern

**State Management:**
- Server state managed via TanStack Query with real-time WebSocket updates
- Local UI state using React hooks
- WebSocket connection for live call updates and agent notifications

**Key UI Patterns:**
- Dashboard with metrics cards and recent activity
- **Chat-based Agent Configuration:** AI-guided conversational interface for creating agents
  - Natural language agent creation (e.g., "Create a billing support agent")
  - AI detects intent and validates configuration automatically
  - Recent chats displayed in sidebar (NLPearl.ai style)
  - Session-based chat with persistent message history
- Call history with search and filtering
- Detailed call view with transcripts and metadata
- Agent management with create/edit forms
- Analytics page with performance metrics
- Settings page for integration configuration

### Backend Architecture

**Technology Stack:**
- **Express.js** server with TypeScript
- **Drizzle ORM** for database abstraction
- **PostgreSQL** via Neon Database serverless driver
- **WebSocket** (ws library) for real-time client updates

**Server Structure:**
- RESTful API design with `/api` prefix
- WebSocket server running alongside HTTP server
- In-memory storage fallback with PostgreSQL as primary persistence
- Seed data system for development/testing

**API Design:**
- Resource-based endpoints (`/api/calls`, `/api/agents`, `/api/settings`)
- Standard CRUD operations with JSON request/response
- Real-time broadcasts to connected clients on data mutations
- Request logging with response capture

**Storage Strategy:**
- Dual storage implementation: `MemStorage` (in-memory) and database (via Drizzle)
- Storage interface (`IStorage`) allows swapping between implementations
- Default agent created on initialization

### Database Schema

**Tables:**

1. **calls** - Call records and metadata
   - Phone number, direction (inbound/outbound), status
   - Duration, recording URL, transcript
   - Agent assignment, tags, and custom metadata
   - Timestamps for creation and updates

2. **agents** - AI agent configurations
   - Name, description, system prompt
   - Voice selection (13 voices), temperature setting
   - Active/inactive status, language preference
   - Timestamps for creation and updates

3. **chatSessions** - Chat conversation sessions
   - Session title (auto-generated from first message)
   - Optional agent ID linkage (when agent created via chat)
   - Timestamps for creation and updates

4. **chatMessages** - Individual chat messages
   - Session ID reference, role (user/assistant)
   - Message content, timestamp
   - Persistent conversation history

5. **settings** - Application configuration key-value store

6. **users** - User management (legacy/minimal implementation)

7. **transcripts** - Call transcription records
   - Call ID reference, speaker identification
   - Transcript text, timestamp
   - Real-time conversation tracking

**Schema Management:**
- Drizzle Kit for migrations (output to `./migrations`)
- Zod schemas derived from Drizzle tables for validation
- Separate insert and update schemas to protect immutable fields

### External Dependencies

**Twilio Integration:**
- Voice call handling through Twilio API
- Configured via Replit Connectors system
- Credentials fetched dynamically from Replit environment
- Phone number provisioning for inbound/outbound calls
- Client initialization with account SID and API keys

**Anthropic Integration:**
- **Claude Sonnet 4 (claude-sonnet-4-20250514)** for chat-based agent configuration
- Conversational AI for guiding users through agent setup
- XML-structured system prompts with `<capabilities>`, `<agent_creation_workflow>`, `<when_to_create>` sections
- Quick create mode: responds to "create it now" with immediate agent creation
- Superior prompt engineering and natural conversation quality vs. GPT-4o-mini
- Integrated via `@anthropic-ai/sdk` package
- API key configuration via ANTHROPIC_API_KEY environment variable

**OpenAI Integration:**
- **GPT-4o Realtime API** for real-time voice conversations during phone calls
- **Whisper-1** for audio transcription
- **Voice Selection (13 available voices):**
  - Legacy voices: alloy, echo, shimmer, fable, onyx, nova
  - New expressive voices (2025): ash, ballad, coral, sage, verse
  - New Realtime-exclusive voices (2025): cedar, marin
- **Interruption Handling:** Advanced system with race-condition guards
  - AI stops speaking immediately when user interrupts
  - Twilio audio buffer clearing for instant audio cutoff
  - State tracking prevents duplicate cancel requests
  - Robust error handling and session stability
- Sentiment analysis returns rating (1-5 stars) and confidence score
- Transcription accepts audio buffers with MIME type specification
- API key configuration via OPENAI_API_KEY environment variable

**Hybrid AI Architecture:**
- **Claude Sonnet 4:** Chat-based agent configuration (superior conversational AI, better prompt engineering)
- **OpenAI:** Voice calls (Realtime API with voice capabilities) + Audio transcription (Whisper)
- Clean separation: chat interface uses Claude, phone calls use OpenAI
- Rationale: Claude excels at conversational AI for configuration, OpenAI provides voice capabilities Claude lacks

**Neon Database:**
- Serverless PostgreSQL hosting
- Connection via `@neondatabase/serverless` driver
- DATABASE_URL environment variable for connection string

**Replit Platform:**
- Connector system for third-party service authentication
- Development plugins (cartographer, dev banner, runtime error overlay)
- Identity tokens for secure API access

### Authentication & Session Management

**Current Implementation:**
- Session-based with `express-session`
- PostgreSQL session store via `connect-pg-simple`
- Cookie-based session persistence
- Minimal user authentication (legacy implementation)

**Note:** Authentication is currently minimal; real-world deployment would require robust user management, role-based access control, and secure authentication mechanisms.

### Build & Deployment

**Development:**
- `npm run dev` - Runs development server with hot reload
- Vite dev server with middleware mode integrated into Express
- TypeScript compilation without emit (type checking only)

**Production:**
- `npm run build` - Builds client (Vite) and server (esbuild)
- Client output: `dist/public`
- Server output: `dist/index.js` (ESM bundle)
- `npm start` - Runs production server

**Configuration:**
- TypeScript paths for clean imports (`@/`, `@shared/`, `@assets/`)
- ESM modules throughout (type: "module" in package.json)
- Strict TypeScript checking enabled