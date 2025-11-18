# SoVoice AI - Design Guidelines

## Overview

SoVoice AI is designed as a modern, chat-first AI voice assistant platform inspired by NLPearl.ai. The interface prioritizes conversation, agent management, and real-time voice interactions with a professional dark theme aesthetic.

## Design Approach

**Primary Reference:** NLPearl.ai
- Dark-first interface with modern gradients
- Chat-centric user experience
- Sidebar-based navigation with agent management
- Clean card-based layouts
- Emphasis on quick-start actions and templates

**Secondary Inspiration:**
- Linear/Stripe: Clean SaaS aesthetics
- Modern dashboard patterns with data visualization

## Color Palette

### Dark Theme (Primary)

**Background Colors:**
- `--background`: 222.2 84% 4.9% (Very dark, almost black)
- `--card`: 222.2 84% 7% (Slightly lighter for cards/panels)
- `--popover`: 222.2 84% 7%

**Foreground Colors:**
- `--foreground`: 210 40% 98% (Off-white for primary text)
- `--muted-foreground`: 215 20.2% 65.1% (Gray for secondary text)
- `--card-foreground`: 210 40% 98%

**Accent Colors:**
- `--primary`: 263.4 70% 50.4% (Purple/violet for brand, buttons, highlights)
- `--primary-foreground`: 210 40% 98%
- `--accent`: 217.2 32.6% 17.5% (Subtle highlight background)
- `--accent-foreground`: 210 40% 98%

**UI Element Colors:**
- `--border`: 217.2 32.6% 17.5% (Subtle borders)
- `--input`: 217.2 32.6% 17.5%
- `--ring`: 263.4 70% 50.4% (Focus rings match primary)

**Semantic Colors:**
- `--destructive`: 0 62.8% 30.6% (Dark red for errors/delete)
- `--destructive-foreground`: 210 40% 98%
- `--success`: 142 76% 36% (Green for success states)
- `--warning`: 38 92% 50% (Orange for warnings)

### Status Badge Colors
- **Inbound/Outbound Calls**: Orange badge (`bg-orange-500`)
- **Elevate/Premium Features**: Purple/violet badge (`bg-primary`)
- **Active Status**: Green indicator
- **Completed**: Muted gray

## Typography

**Font Stack:**
- **Primary**: Inter (via Google Fonts)
  - Weights: 300, 400, 500, 600, 700
  - Used for all UI text, headings, body copy
- **Monospace**: JetBrains Mono
  - Weights: 400, 500, 600
  - Used for phone numbers, IDs, code snippets

**Hierarchy:**
- **Hero Headings**: `text-4xl md:text-5xl font-bold` - Main dashboard greeting
- **Page Titles**: `text-2xl md:text-3xl font-semibold` 
- **Section Headers**: `text-lg md:text-xl font-semibold`
- **Card Titles**: `text-base md:text-lg font-medium`
- **Body Text**: `text-sm md:text-base font-normal`
- **Metadata/Labels**: `text-xs font-medium text-muted-foreground`

## Layout Structure

### Main Application Layout

```
┌─────────────────────────────────────────────────┐
│  Sidebar (240px-280px)  │  Main Content Area   │
│  ┌──────────────────┐   │                       │
│  │  Logo / Brand    │   │   Top Bar (optional)  │
│  ├──────────────────┤   │                       │
│  │  Chat/New Pearl  │   │   ┌─────────────────┐ │
│  ├──────────────────┤   │   │  Page Content   │ │
│  │  Recent Agents   │   │   │                 │ │
│  │  - Agent 1       │   │   │                 │ │
│  │  - Agent 2       │   │   │                 │ │
│  │  - Agent 3       │   │   │                 │ │
│  ├──────────────────┤   │   │                 │ │
│  │  Navigation      │   │   │                 │ │
│  │  - Dashboard     │   │   └─────────────────┘ │
│  │  - Call History  │   │                       │
│  │  - Analytics     │   │                       │
│  │  - Settings      │   │                       │
│  └──────────────────┘   │                       │
└─────────────────────────────────────────────────┘
```

### Spacing System

Use Tailwind's spacing scale consistently:
- **Micro spacing**: `gap-1`, `gap-2` (4px, 8px) - Between related small items
- **Small spacing**: `gap-3`, `gap-4` (12px, 16px) - Between form elements, list items
- **Medium spacing**: `gap-6`, `gap-8` (24px, 32px) - Between sections, cards
- **Large spacing**: `gap-12`, `gap-16` (48px, 64px) - Page sections, major divisions

**Padding:**
- Cards: `p-6` or `p-8`
- Modals: `p-6` to `p-10`
- Sidebar: `p-4` to `p-6`
- Page content: `px-6 py-8` or `px-8 py-10`

## Key Page Structures

### Dashboard (Home) Page - NLPearl.ai Style

**Hero Section:**
```
┌──────────────────────────────────────────────────────┐
│  Hey, [UserName] 👋                                  │
│  Let's build your AI voice agent                     │
│                                                       │
│  ┌────────────────────────────────────────────────┐ │
│  │ Ask SoVoice to create an AI agent that runs... │ │
│  │ [Input field with send button]                  │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
│  Not sure where to start? Try one of these:          │
│  [🔵 Inbound Phone Agent] [🔵 Outbound Phone Agent] │
└──────────────────────────────────────────────────────┘
```

**Community Templates Section:**
```
From the Community

[Search] [Sort by ▼] [Inbound] [Outbound]

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  [Icon]      │  │  [Icon]      │  │  [Icon]      │
│  🟠 Template │  │  🟣 Elevate  │  │  🟣 Elevate  │
│  Template    │  │  Hotel       │  │  Pizza       │
│  Name        │  │  Inbound     │  │  SliceLine   │
│              │  │              │  │              │
│  ♡ 0  👁 1   │  │  ♡ 0  👁 1   │  │  ♡ 0  👁 1   │
└──────────────┘  └──────────────┘  └──────────────┘
```

### AI Chat Page

**Full-height chat interface:**
```
┌──────────────────────────────────────────┐
│  Chat with SoVoice AI                    │
├──────────────────────────────────────────┤
│  [Message bubbles]                       │
│  User: Create a sales agent              │
│  AI: I'll help you create...             │
│                                           │
│  [Scrollable message area]               │
│                                           │
├──────────────────────────────────────────┤
│  [Input field]              [Send btn]   │
└──────────────────────────────────────────┘
```

### Agent Management/Call History

**List view with cards:**
```
┌──────────────────────────────────────────┐
│  [Search/Filter bar]                     │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐ │
│  │ Agent Name        [Edit] [Delete]  │ │
│  │ Status: Active    Type: Inbound    │ │
│  │ Created: 2h ago   Calls: 12        │ │
│  └────────────────────────────────────┘ │
│  ┌────────────────────────────────────┐ │
│  │ Agent Name 2      [Edit] [Delete]  │ │
│  │ ...                                 │ │
│  └────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

## Component Specifications

### Sidebar

**Structure:**
- Logo/Brand at top (48px-56px height)
- "New Pearl" button (full-width, primary color)
- "Recent Pearls" section (collapsible list of agents)
- Navigation menu items with icons
- User profile/settings at bottom (optional)

**Agent List Item:**
- Icon (32px circle or square)
- Agent name (text-sm font-medium)
- Active indicator (green dot if live)
- Hover: Subtle bg-accent background

### Cards

**Template Card (Community Section):**
- Aspect ratio: ~4:3 or 16:10
- Header: Icon/image placeholder
- Badge: Orange "Template" or Purple "Elevate"
- Title: text-base font-semibold
- Subtitle: text-sm text-muted-foreground
- Footer: Like count, view count
- Rounded: `rounded-lg` or `rounded-xl`
- Border: `border border-border`
- Hover: Slight elevation (`hover-elevate`)

**Agent Card:**
- Horizontal layout: Icon + Content
- Icon: 40px-48px (bot icon, colored circle)
- Title: text-base font-semibold
- Meta: Status badge, type, stats
- Actions: Edit/Delete buttons (icon buttons)

**Stat Card (Metrics):**
- Large number: text-3xl font-bold
- Label: text-sm text-muted-foreground
- Icon: 20px-24px, primary color
- Optional: Trend indicator (+5% ↑)
- Optional: Mini sparkline chart

### Buttons

**Primary Actions:**
- `variant="default"` - Primary purple background
- `size="default"` or `size="lg"` for CTAs
- Examples: "Create Agent", "Start Call", "Send Message"

**Secondary Actions:**
- `variant="outline"` - Transparent with border
- Used for: "Cancel", "View Details", alternative actions

**Quick-start Buttons (Dashboard):**
- Large, prominent buttons
- Icon + Text layout
- `min-h-12` or `min-h-14`
- Full-width on mobile, side-by-side on desktop

### Input Fields

**Chat Input (Hero Section):**
- Large input field: `min-h-14` or `min-h-16`
- Placeholder: "Ask SoVoice to create an AI agent that runs..."
- Send button integrated (right side)
- `rounded-full` or `rounded-xl`
- Subtle shadow or border

**Standard Forms:**
- Label above input
- `border-border` subtle border
- Focus ring: `ring-primary`
- Helper text below (text-xs text-muted-foreground)

### Badges

**Status Badges:**
- `rounded-full px-2.5 py-1 text-xs font-medium`
- Orange: `bg-orange-500/10 text-orange-500`
- Purple/Elevate: `bg-primary/10 text-primary`
- Green (Active): `bg-green-500/10 text-green-500`
- Gray (Muted): `bg-muted text-muted-foreground`

## Animations & Interactions

**Hover States:**
- Cards: Subtle elevation (`hover-elevate`)
- Buttons: Built-in hover states (no custom needed)
- Links: Underline or color shift

**Page Transitions:**
- Fade in: 200-300ms
- No aggressive slide/zoom animations

**Loading States:**
- Skeleton screens for content
- Spinner for buttons: `isPending` state
- Shimmer effect for cards (optional)

## Dark Mode Considerations

**Primary Mode:** Dark theme by default
- All components designed dark-first
- Light mode optional (future enhancement)
- Ensure sufficient contrast for text (WCAG AA minimum)

**Image/Icon Handling:**
- Use SVG icons (Lucide React) - inherits text color
- Logo: Ensure legibility on dark background
- Placeholder images: Use muted backgrounds

## Accessibility

- Focus indicators visible (ring-primary)
- ARIA labels for icon-only buttons
- Semantic HTML (nav, main, aside)
- Keyboard navigation support
- Color contrast: 4.5:1 minimum for text

## Responsive Breakpoints

- Mobile: < 640px (sm) - Stack vertically, hide sidebar (drawer)
- Tablet: 640px-1024px (sm-lg) - Collapsible sidebar
- Desktop: > 1024px (lg+) - Full sidebar visible

**Sidebar Behavior:**
- Desktop: Always visible (240px-280px)
- Tablet: Collapsible/toggle
- Mobile: Drawer overlay (full-width)

## Data Visualization

**Charts (Analytics page):**
- Library: Recharts
- Colors: Primary purple for main data, muted for secondary
- Grid: Subtle `stroke-border`
- Tooltips: Dark theme (`bg-popover`)
- Minimal style, focus on data clarity

**Progress Indicators:**
- Linear: `<Progress />` component
- Circular: For percentages (call quality, success rate)

## Implementation Notes

1. **Use shadcn/ui components** wherever possible
2. **Follow Tailwind utility classes** - minimize custom CSS
3. **Dark theme first** - define all colors in index.css
4. **Component hierarchy**: Page → Sections → Cards → Elements
5. **Test dark mode contrast** - ensure readability
6. **Mobile-first responsive design**
7. **Keep animations subtle** - performance and accessibility

## Key Visual Elements from NLPearl.ai

✅ Dark, almost-black background
✅ Purple/violet primary color for brand
✅ Clean sidebar with agent list
✅ Hero greeting: "Hey, [Name] 👋"
✅ Large chat input field
✅ Quick-start action buttons
✅ Community templates grid with badges
✅ Modern card design with subtle borders
✅ Icon-driven navigation
✅ Status badges (Orange, Purple, Green)

This design creates a professional, modern AI platform with emphasis on conversation and ease of use.
