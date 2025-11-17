# AI Voice Call Assistant - Design Guidelines

## Design Approach

**Selected Approach:** Design System with SaaS Best Practices
- Reference systems: Material Design (data-heavy components) + Linear/Stripe aesthetics (clean, modern SaaS)
- Inspiration from NLPearl's professional, enterprise-focused interface
- Emphasis on clarity, efficiency, and data visualization

## Core Design Principles

1. **Professional Clarity:** Clean, uncluttered layouts that prioritize information hierarchy
2. **Data-First:** Charts, metrics, and analytics take visual precedence
3. **Efficient Workflows:** Minimize clicks, maximize productivity
4. **Trust & Reliability:** Conservative, stable design that conveys enterprise credibility

## Typography

**Font Stack:**
- Primary: Inter or Work Sans (clean, modern sans-serif via Google Fonts)
- Monospace: JetBrains Mono (for API endpoints, phone numbers, technical data)

**Hierarchy:**
- Headings: Font weights 600-700, sizes from text-3xl (dashboard headers) to text-sm (section labels)
- Body: Font weight 400-500, text-base for primary content, text-sm for secondary
- Data/Metrics: Font weight 600-700, larger sizes (text-2xl to text-4xl) for key statistics
- Labels/Metadata: Font weight 500, text-xs to text-sm, subtle contrast

## Layout System

**Spacing Primitives:** Use Tailwind units 2, 4, 6, 8, 12, 16
- Component padding: p-4 to p-8
- Section spacing: space-y-6 to space-y-12
- Card/Container gaps: gap-4 to gap-6

**Grid Structure:**
- Dashboard: Sidebar (w-64) + Main content area (flex-1)
- Cards: Grid with responsive columns (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
- Tables: Full-width with horizontal scroll on mobile

**Container Widths:**
- Dashboard content: max-w-7xl with px-6 to px-8
- Forms/Modals: max-w-2xl
- Call detail views: max-w-4xl

## Component Library

### Navigation
- **Sidebar:** Fixed left navigation with logo, main menu items, user profile at bottom
- Vertical menu with icons + labels, active state indicators
- Collapsible on mobile (hamburger menu)

### Dashboard Components
- **Stat Cards:** Grid of key metrics (total calls, success rate, average duration, active agents)
- Each card: Large number, label, trend indicator, sparkline chart
- **Call History Table:** Sortable columns (date/time, caller, duration, status, recording)
- Row actions: view transcript, play recording, tag/categorize
- **Analytics Charts:** Line graphs for call volume over time, bar charts for success rates, pie charts for call categories
- **Real-time Activity Feed:** Live call status updates with timestamps

### Call Management
- **Call Detail View:** Split layout - transcript on left (scrollable), metadata/actions on right
- Audio player with waveform visualization, playback controls
- AI insights panel: tags, sentiment, key topics extracted
- **Agent Configuration:** Form-based interface for setting up AI prompts, conversation flows
- Prompt editor with syntax highlighting
- **Integration Settings:** Card-based layout for connected services (Twilio, OpenAI, CRMs)
- Connection status indicators, configuration buttons

### Forms & Inputs
- Standard text inputs with labels above, helper text below
- Phone number inputs with country code selector
- Toggle switches for binary options
- Dropdown selects for categorization
- Text areas for prompts (minimum 4 rows)

### Buttons & Actions
- Primary: Solid fills for main actions (Start Call, Save Configuration)
- Secondary: Outlined or ghost style for alternative actions
- Icon buttons: For compact actions in tables/cards
- Size variants: text-sm to text-base, px-4 py-2 to px-6 py-3

### Data Visualization
- **Charts:** Clean, minimal style with subtle gridlines
- Use libraries like Chart.js or Recharts
- Tooltips on hover showing detailed data
- **Progress Indicators:** For call quality scores, success metrics
- Circular or linear progress bars with percentage labels

### Modals & Overlays
- **Modals:** Centered, max-w-2xl, backdrop blur
- Close button top-right, clear header, action buttons bottom-right
- **Toasts/Notifications:** Top-right positioned, auto-dismiss
- Success/error/info variants with icons

## Animations

**Minimal & Purposeful:**
- Smooth transitions on navigation (150-200ms)
- Subtle hover states on interactive elements
- Page transitions: fade-in (300ms)
- Charts: Animated data loading (500ms stagger)
- Real-time updates: Gentle highlight flash when new data appears
- NO decorative or distracting animations

## Images

**Dashboard/Platform Images:**
- **Hero Section (Landing/Login Page):** Abstract illustration or photo representing AI/voice technology (waveforms, speech visualization, or professional customer service imagery)
- Size: Full-width hero, ~500-600px height
- **Empty States:** Illustration for "No calls yet" or "No data available"
- **Integration Logos:** Service logos (Twilio, OpenAI, Salesforce, etc.) displayed as cards

## Key Pages Structure

### Dashboard Home
- Top metrics bar (4 stat cards)
- Two-column layout: Charts (left 2/3) + Activity feed (right 1/3)
- Recent calls table below

### Call History
- Filters/search bar at top
- Full-width sortable table
- Pagination at bottom

### Call Detail
- Header: Caller info, timestamp, duration, status badge
- Main content: Transcript (scrollable) + Audio player + AI insights sidebar

### Agent Configuration
- Tabbed interface: Prompts, Actions, Integration, Settings
- Form-based editing with live preview option

### Analytics
- Date range selector at top
- Grid of charts showing various metrics
- Export/download options

This design creates a professional, data-focused SaaS platform optimized for efficient call management and analytics while maintaining a clean, trustworthy aesthetic suitable for enterprise use.