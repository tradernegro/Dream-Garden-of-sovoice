# SoVoice AI - Voice Call Assistant Platform

## Overview

SoVoice AI is an AI-powered voice call assistant platform designed to automate customer phone interactions. The application provides real-time conversation management, call analytics, and agent configuration capabilities. Built as a full-stack SaaS platform, it enables businesses to handle inbound and outbound calls using AI agents with customizable behavior and voice characteristics.

## Recent Changes (November 2025)

- **Secure Microsoft OAuth with External Window Authentication**: Implemented secure OAuth flow with CSRF protection
  - OAuth authentication opens in external popup window (600x700px) for better user experience
  - Added state parameter generation and validation to prevent CSRF attacks
  - Single-use state tokens with 10-minute expiry and automatic cleanup
  - Popup window monitoring with timeout handling and proper error state recovery
  - Fixed token refresh to maintain authentication context without unauthorized fallbacks
  - Admin consent flow requests permanent access with refresh tokens
  - Automatic window closure with parent notification via postMessage
  - Clear user feedback for popup blocking, timeouts, and cancellation scenarios

## Previous Changes (November 2025)

- **Enhanced Internal Calendar System with Green Visual Indicators**: Improved calendar UI with automatic appointment display
  - Calendar dates with appointments now show in light/living green color with check icon
  - Real-time WebSocket updates ensure appointments appear immediately when created during calls
  - Appointment title format standardized to "Termin – [Customer Name]"
  - Date/time format displays as DD.MM.YYYY – HH:MM for German locale
  - Appointments sorted chronologically with multiple appointments per day properly organized
  - Green-themed cards for appointment details with clear visual hierarchy
  - Added comment field showing call details and qualification information

## Recent Changes (Previous)

- **Automatic Calendly Appointment Scheduling**: Implemented automatic appointment creation during calls
  - Automatically schedules Calendly appointments when customer name and email are collected
  - Flexible event type matching supports URI, ID, or name-based lookup (e.g., "30min" matches "30 Minute Meeting")
  - Falls back to first available event type if exact match not found
  - Sends confirmation emails via Microsoft Outlook integration
  - Updates call metadata with appointment details and status
  - Works with both OpenAI Realtime and ElevenLabs voice providers
- **Automatic Customer Metadata Extraction**: Added intelligent extraction of customer information during calls
  - Automatically extracts customer name, email, and company from conversation transcripts
  - Supports both German and English language patterns for name and company extraction
  - Real-time metadata updates during active calls for both OpenAI and ElevenLabs voice providers
  - Customer information prominently displayed in Calls UI with badges and labels
  - Metadata persisted in database for future reference and CRM integration
- **Calendly Webhook Integration**: Implemented secure webhook handling with real-time event updates
  - Added HMAC signature verification using SHA-256 for webhook security
  - Implemented timestamp validation (5-minute tolerance) to prevent replay attacks
  - Real-time event notifications via WebSocket for scheduled/cancelled meetings
  - Automatic event refresh when webhook events are received
  - Webhook endpoint: POST /api/calendly/webhook
- **Enhanced OAuth Security**: Strengthened Calendly OAuth implementation  
  - Added CSRF protection with cryptographically secure state parameter
  - Dynamic redirect URI generation based on Replit domains
  - State token expiration (10 minutes) with automatic cleanup
  - Single-use state tokens to prevent replay attacks
- **Manual Token Configuration**: Implemented alternative authentication method for Microsoft Outlook
  - Added manual access token configuration dialog since OAuth is blocked in Replit environment
  - Users can now generate tokens from Microsoft Graph Explorer and input them directly
  - Token and connection status persist across sessions
- **Color Scheme Update**: Successfully updated entire application from blue to orange theme
  - Changed all CSS color variables from hue 210 (blue) to hue 30 (orange)
  - Updated primary, secondary, accent, sidebar, and chart colors in both light/dark modes
  - Applied orange theme consistently across all UI components and code highlighting

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
- **Whisper-1** for audio transcription (used by both OpenAI and ElevenLabs voice providers)
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

**ElevenLabs Integration:**
- **Text-to-Speech (TTS):** High-quality, natural-sounding voice synthesis
- **Voice Library:** 20+ premium voices with diverse characteristics and accents
- **Streaming Audio:** Real-time MP3 audio streaming for low-latency responses
- **Voice Models:** eleven_turbo_v2_5 for fast, high-quality synthesis
- **Hybrid Pipeline Architecture:**
  - Inbound Twilio audio (μ-law/G.711) → Whisper transcription
  - User transcript → GPT-4 Chat Completion → AI response text
  - AI text → ElevenLabs TTS → MP3 audio stream
  - MP3 → μ-law conversion (via FFmpeg) → Twilio audio output
- **Audio Codec Pipeline:**
  - μ-law to WAV: alawmulaw + wavefile libraries for Whisper input
  - MP3 to μ-law: fluent-ffmpeg for Twilio telephony output
  - Mono 8kHz format for telephony compatibility
- **Session Management:** `ElevenLabsRealtimeSession` class with silence detection (800ms threshold)
- **Voice Provider Selection:** Agents configured with `voiceProvider` field ("openai" or "elevenlabs")
- API key configuration via ELEVENLABS_API_KEY environment variable

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