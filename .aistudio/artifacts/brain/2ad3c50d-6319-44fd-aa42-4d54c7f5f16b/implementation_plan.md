# CivicDistrict — Congressional District & Representative Lookup PWA

CivicDistrict is an installable Material Design 3 Progressive Web App that lets US residents enter a single 5-digit ZIP code to immediately identify their congressional district(s), House Representative(s), and US Senators, then inspect each lawmaker's profile, contact channels, source-attributed fact-check records, and voting history in a structured detail modal.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following product and design choices were confirmed during Phase 1 clarification and are locked into this plan:
> - **Visual Theme**: Crisp light civic Material Design 3 palette with subtle tonal elevation (alabaster paper canvas, pure white surface containers, deep federal navy primary accent).
> - **Row 1 Profile Enrichment**: Alongside official portrait, name, age, party, and years in office, Row 1 displays **committee assignments and leadership roles** plus **next election year and term end date**.
> - **Split-District ZIP Codes**: When a 5-digit ZIP code spans multiple congressional districts, all overlapping districts are listed with an instant **segmented district switcher** so users can inspect the exact representative for each overlapping district alongside both state US Senators.

---

## 1. Overview & Core Concept

- **What It Does**: Opens with a focused, zero-clutter single-field ZIP code onboarding prompt. Submitting a valid 5-digit US ZIP code resolves the user's congressional district(s) and displays every matching House Representative and US Senator as an interactive **Material Design 3 Extended Floating Action Button (Extended FAB)**. Clicking any Extended FAB opens a four-row profile modal covering identity and office tenure, comprehensive contact and community links, a collapsible panel of source-attributed fact-check summaries, and a collapsible panel of recent roll-call votes and legislative activity.
- **Target Audience / Persona**: Engaged voters, civic researchers, journalists, and constituents on both mobile phones and desktop browsers who want fast, nonpartisan, verifiable access to their federal representatives—including offline access to previously looked-up districts once installed as a PWA.
- **Key Value**: Removes the friction of hunting across separate House, Senate, contact, voting, and fact-checking websites by unifying live web-grounded civic records into a single fast, installable, touch-friendly interface with strict source attribution.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Zero-State Onboarding**:
   - User lands on a calm, authoritative civic canvas anchored by a single Material Design 3 Outlined Text Field prompting for a 5-digit ZIP code (`inputMode="numeric"`, real-time 5-digit validation, inline error guidance).
   - Quiet quick-sample ZIP shortcuts (e.g., `10001`, `94107`, `60611`, `78701`, `20001`) and recently cached ZIP lookups appear subtly below the input for effortless exploration and offline recall.
2. **District & Delegation Overview**:
   - After lookup, the view transitions cleanly to display the resolved city, state, and congressional district summary.
   - If the ZIP spans multiple districts, a Material segmented district switcher lets the user switch between overlapping districts without re-entering the ZIP code.
   - **US Representative(s)** and **US Senators** are presented in a spacious responsive grid of clickable **Material Extended FABs**, each displaying a circular portrait avatar (with monogram fallback), full name, chamber/title, unboxed metadata (`Party · District or Senate Class · Next Election`), and a clear inspection affordance.
   - An inline ZIP switcher in the workspace toolbar lets users query a new ZIP code at any moment.
3. **Four-Row Congressperson Detail Modal**:
   - Clicking any Extended FAB opens a Material Design 3 dialog (centered elevated sheet on desktop, ergonomic bottom-aligned modal sheet on mobile) with keyboard Escape support, focus management, and backdrop dismissal:
     - **Row 1 — Identity & Office Summary (Single Row)**: Left-aligned official portrait photograph (with resilient editorial monogram fallback if an image cannot load) paired on the right with Name, Chamber & Title, Party, Age, Years in Office, Next Election Year & Term End Date, and Committee Assignments / Leadership Roles.
     - **Row 2 — Contact & Digital Channels**: Actionable Material contact tiles for Washington DC and district phone numbers (`tel:`), official email/contact portal, official website, and verified social/community accounts (X, Instagram, Facebook, YouTube, Bluesky/Threads, Reddit, Discord when officially maintained, clearly noting when platforms like Reddit or Discord have no verified official presence).
     - **Row 3 — Collapsible Fact-Check Sources**: Expandable Material accordion panel presenting neutral, **source-attributed** fact-check records and summaries from **PolitiFact**, **FactCheck.org**, **The Washington Post Fact Checker**, **Snopes**, and other nonpartisan monitors, with direct outbound links to each cited source.
     - **Row 4 — Collapsible Voting Record & Legislative Activity**: Expandable Material accordion panel presenting recent notable roll-call votes (bill ID, title, date, vote cast, neutral one-line context) and key sponsored legislation, with links to official congressional records.
4. **PWA Installation & Offline Flow**:
   - An in-app **Install App** button mounts in the top app bar whenever the browser fires `beforeinstallprompt` (or opens a guided "Add to Home Screen" modal on iOS Safari), and automatically hides once running in `standalone` mode.
   - When network connectivity drops, a non-intrusive offline indicator notifies the user while allowing full browsing of all cached ZIP lookups and previously inspected representative modals.

### Visual Identity & Theme

- **Aesthetic Direction**: Modern Civic Editorial meets Material Design 3 — disciplined, nonpartisan, institutional clarity with tactile Material elevation and responsive touch ergonomics.
- **Color Palette & Mood (60-30-10 Light Civic Posture)**:
  - *60% Dominant Canvas*: Crisp Alabaster Paper (`--background: #F8F9FA`)
  - *30% Structural Surfaces*: Pure White (`--surface: #FFFFFF`), Cool Tonal Surface (`--surface-container: #EFF2F6`), Hairline Dividers (`--outline: #D8DEE6`), Slate Secondary Text (`--muted-foreground: #475569`)
  - *10% Accent & Ink*: Deep Federal Navy (`--primary: #1B365D`), Soft Tonal Primary Container (`--primary-container: #DCE6F5`), Deep Charcoal Ink (`--foreground: #0F172A`).
  - Semantic labels for party affiliation (`Democratic`, `Republican`, `Independent`) and vote outcomes (`Yea`, `Nay`, `Not Voting`) always combine restrained typographic color with explicit text labels—never relying on hue alone or candy-colored pill badges.
- **Typography & Hierarchy (2 + 1 Civic Pairing)**:
  - *Display & Official Names*: **Fraunces** (authoritative editorial serif for hero headlines and lawmaker names, with `text-wrap: balance`).
  - *UI Controls & Body Prose*: **Public Sans** (crisp civic neo-grotesque for Material buttons, labels, and readable summaries).
  - *Structured Data & Numerals*: **IBM Plex Mono** with `tabular-nums` for ZIP codes, district codes, phone numbers, dates, and bill identifiers.
- **Component Styling & Layout**:
  - Clean 3-zone Top App Bar (`CivicDistrict` wordmark — concise single-line nav links — single primary action / PWA Install trigger).
  - Mobile-first touch targets ($\ge 44\times 44\text{px}$; Extended FABs $\ge 64\text{px}$ height) expanding smoothly to a spacious `max-w-6xl` multi-column layout on 1440px desktop viewports.
  - Zero static pill enclosures around metadata (unboxed text separated by `·`), single-level Material tonal elevation, no thick left accent borders, and generous whitespace between modal rows separated by 1px hairline dividers.

### Interactive Feedback & Motion

- Material state layers and subtle lift transitions (`150ms–200ms`, compositor-only `transform` and `opacity` using `cubic-bezier(0.16, 1, 0.3, 1)`).
- Dedicated Material skeleton shimmer placeholders while live lookup or modal detail enrichment loads, plus clean retry error banners if an upstream request fails.
- Respects `prefers-reduced-motion` across modal transitions and collapsible accordion panels.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Live Web-Grounded Server Lookup vs. Static Bundled Roster**
  - *Chosen Approach*: Server-side Express API powered by `@google/genai` (`gemini-4-hydrogen`) with **Google Search grounding**, combined with a server-side TTL cache and client-side `localStorage` offline cache.
  - *Why*: Congressional rosters, committee leadership, recent roll-call votes, and fact-checker archives change continuously across election cycles and special elections. Live search grounding delivers current, verifiable records with real citation URLs across all 435 House districts and 100 Senate seats without requiring users to configure third-party API keys.
  - *Alternatives Considered*: Hardcoding a static JSON roster (becomes stale quickly and omits fact-checks and recent votes) or requiring paid third-party civic API keys (violates zero-key-UI ergonomics).
- **Decision 2: Nonpartisan Source-Attributed Fact-Check Presentation**
  - *Chosen Approach*: Attribute every fact-check summary explicitly to its publishing organization (PolitiFact, FactCheck.org, Washington Post Fact Checker, Snopes, etc.) with clickable source URLs, and state plainly when an organization has no published profile for a given lawmaker.
  - *Why*: Ensures editorial neutrality, factual integrity, and transparency—avoiding invented composite "truthfulness scores" or partisan rankings.
- **Decision 3: Two-Stage Data Loading (Fast Roster + On-Demand Deep Profile)**
  - *Chosen Approach*: Stage 1 (`/api/lookup`) rapidly resolves the ZIP code, district(s), and Row 1 core bio/committee data for all Extended FABs. Stage 2 (`/api/representative-details`) fetches Row 2 contact/community channels, Row 3 fact-check attributions, and Row 4 voting records on modal open (with instant cache hit on revisit).
  - *Why*: Keeps the initial ZIP lookup snappy while delivering deep, thoroughly grounded fact-check and voting-record citations when a user inspects an individual lawmaker.
- **Decision 4: Full PWA Installability & Offline Recall**
  - *Chosen Approach*: `vite-plugin-pwa` with auto-updating Workbox service worker, compliant Web App Manifest (`any` + safe-zone `maskable` 192/512 PNG icons + 180px iOS `apple-touch-icon.png`), in-app install button with iOS guide, and `localStorage` persistence for looked-up ZIPs and opened dossiers.
  - *Why*: Delivers genuine native-like installability and offline utility for constituents referencing representative phone numbers or voting records on the go.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CivicDistrict PWA (Browser)                          │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Top App Bar (3-Zone): [CivicDistrict] — [Lookup · Delegation · Guide]  │  │
│  │                       — [PWAInstallButton / Change ZIP]                │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                       │
│          ┌───────────────────────────┴───────────────────────────┐           │
│          ▼                                                       ▼           │
│  ┌──────────────────────────────┐                ┌────────────────────────┐  │
│  │ Onboarding ZIP Search View   │                │ District & Delegation  │  │
│  │ • Material Outlined ZIP Input│ ── lookup ──▶  │ • District Summary Bar │  │
│  │ • Validation & Sample ZIPs   │                │ • Split-ZIP Switcher   │  │
│  │ • Recent Offline ZIP History │                │ • Extended FAB Grid    │  │
│  └──────────────────────────────┘                │   (House + US Senate)  │  │
│                                                  └───────────┬────────────┘  │
│                                                              │ click FAB     │
│                                                              ▼               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Representative Detail Modal (Material 3 Dialog / Mobile Sheet)         │  │
│  │  Row 1: [Official Portrait] | Name, Party, Age, Years, Term, Committees│  │
│  │  Row 2: Phone(s), Email/Contact, Website, Social, Reddit, Discord      │  │
│  │  Row 3 (Collapsible): Fact-Check Records (PolitiFact, FactCheck, WaPo, │  │
│  │                       Snopes & other nonpartisan cited sources)        │  │
│  │  Row 4 (Collapsible): Recent Roll-Call Votes & Key Legislation         │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                       │
│  ┌───────────────────────────────────┴────────────────────────────────────┐  │
│  │ Client State & Offline Layer: localStorage ZIP/Profile Cache +         │  │
│  │ Workbox Service Worker + usePWAInstall + OfflineIndicator              │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       │ HTTPS JSON API
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     Express Server (Port 3000 + Vite)                        │
│                                                                              │
│  POST /api/lookup                  POST /api/representative-details          │
│   • Validate 5-digit ZIP            • Validate member name, chamber, state   │
│   • Check Server TTL Cache          • Check Server TTL Cache                 │
│   • Gemini 4 Hydrogen +             • Gemini 4 Hydrogen +                    │
│     Google Search Grounding           Google Search Grounding                │
│   • Parse & sanitize JSON +         • Parse & sanitize contact links,        │
│     grounding source citations        attributed fact-checks, voting record  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **DistrictLookupResult**:
  - `zip`: 5-digit ZIP string
  - `city`, `state`, `stateCode`: Geographic summary
  - `isSplitDistrict`: Boolean indicating multi-district ZIP overlap
  - `districts`: Array of `{ code, label, representativeIds[] }`
  - `representatives`: Array of `CongressMemberSummary` (id, name, title, chamber, party, districtCode, state, age, yearsInOffice, termStartYear, nextElectionYear, termEndDate, committees[], leadershipRoles[], portraitUrl, bioguideId)
  - `sources`: Grounding citation array (`{ title, uri }`)
  - `fetchedAt`: ISO timestamp for cache freshness
- **RepresentativeDetailRecord**:
  - `memberId`: Links to `CongressMemberSummary`
  - `contact`: Washington & district phones, official email/contact URL, official website, office addresses, social/community channels (`x`, `instagram`, `facebook`, `youtube`, `threads`, `bluesky`, `reddit`, `discord`)
  - `factChecks`: Array of `{ outlet, summary, recentChecks: [{ claim, assessment, date, url }], profileUrl, availabilityNote }` covering PolitiFact, FactCheck.org, Washington Post Fact Checker, Snopes, and additional nonpartisan outlets
  - `votingRecord`: `{ summary, sessionLabel, keyVotes: [{ billNumber, title, date, vote, summary, url }], sponsoredBills: [{ billNumber, title, status, url }] }`
  - `sources`: Grounding citation array (`{ title, uri }`)
- **UI & Offline State**:
  - Active view (`onboarding` vs. `results`), selected split-district index, active modal member ID, independent collapse states for Row 3 (Fact-Check Records) and Row 4 (Voting Record), loading/error states per stage, and persisted offline cache of recent ZIP lookups and opened member profiles.

### Interactive Component & State Mapping

- **ZIP Input Form**: Validates 5-digit numeric input, trims non-digits, shows immediate inline validation feedback, checks offline cache when offline, or triggers `POST /api/lookup` with loading feedback and error recovery retry.
- **Split-District Switcher**: Updates `activeDistrictCode` state to filter the House Representative Extended FABs for the chosen district (or "All Overlapping Districts") while keeping both state US Senators visible.
- **Material Extended FABs**: Each FAB triggers `openMemberModal(member)` which opens the dialog immediately with Row 1 data already hydrated and initiates `POST /api/representative-details` (or restores from cache) to populate Rows 2, 3, and 4.
- **Collapsible Accordions (Row 3 & Row 4)**: Dedicated accessible `<button aria-expanded>` headers toggle smooth height/opacity expansion independently for Fact-Check Records and Voting Record, with clear visual chevrons and summary counts.
- **Contact Action Links & Copy Controls**: Clicking phone numbers dials via `tel:`, clicking contact/social links opens verified `https://` URLs safely with `rel="noopener noreferrer"`, and one-tap copy buttons provide immediate confirmation feedback for phone numbers and addresses.
- **PWA Install & Offline Controls**: `PWAInstallButton` invokes the deferred browser install prompt or opens the iOS Safari installation guide dialog; `OfflineIndicator` reacts live to browser `online`/`offline` events.

### Key Sequences & Integrations

- **Server-Side Gemini Grounding**: Uses `@google/genai` (upgraded to latest `>= 2.29.1`) initialized strictly server-side with `process.env.GEMINI_API_KEY` and `User-Agent: 'aistudio-build'`, invoking `gemini-4-hydrogen` with `{ googleSearch: {} }` so every congressional lookup, fact-check summary, and roll-call vote is grounded in live web sources and returned with verifiable source citations.
- **Portrait Resilience**: Resolves official Congressional Bioguide / public-domain portrait URLs where available and pairs every `<img>` (`referrerPolicy="no-referrer"`) with an automatic styled editorial monogram fallback on error so broken image frames never appear.
- **PWA Asset Generation**: Generates crisp, high-contrast civic emblem PNG icons (`192x192`, `512x512`, padded `maskable` `512x512`, `180x180` `apple-touch-icon.png`) plus `icon.svg` and configures `vite-plugin-pwa` with `devOptions.enabled: true` and Workbox asset/font runtime caching.
