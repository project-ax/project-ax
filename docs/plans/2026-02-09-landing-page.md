# Open-Source Project Landing Page — Design & Build Plan

## 1. Design Philosophy

**Aesthetic direction:** Refined dark minimalism — inspired by Linear's approach but with its own identity. The page should feel like a precision instrument: quiet confidence, zero clutter, every element earning its place.

**Core principles:**
- Dark-first with luminous accents (not just "dark mode" — the darkness IS the design)
- Motion as meaning — animations guide attention, not distract
- Typography-led hierarchy — the type does 80% of the work
- Depth through glass and glow — layered translucency creates spatial richness

---

## 2. Tech Stack

| Layer | Tool | Why |
|-------|------|-----|
| Framework | **Next.js 14+ (App Router)** | SSR, file-based routing, optimized builds |
| Styling | **Tailwind CSS v4** | Utility-first, fast iteration, dark theme support |
| Animation | **Framer Motion** | Scroll-triggered reveals, layout animations, spring physics |
| Fonts | **Google Fonts** — `"Geist"` (heading) + `"Geist Mono"` (code/accents) | Modern, engineered feel — fits dev tools aesthetic |
| Icons | **Lucide React** | Clean, consistent, lightweight |
| Deployment | **Vercel** | Zero-config for Next.js |

---

## 3. Color System

```css
/* CSS Variables — define in globals.css */
--bg-primary:       #09090b;     /* near-black base */
--bg-secondary:     #111113;     /* card/section bg */
--bg-elevated:      #1a1a1e;     /* hover states, elevated surfaces */

--text-primary:     #fafafa;     /* headings */
--text-secondary:   #a1a1aa;     /* body text */
--text-tertiary:    #52525b;     /* muted/disabled */

--accent:           #6366f1;     /* indigo — primary accent */
--accent-glow:      #818cf8;     /* lighter accent for glows */
--accent-subtle:    rgba(99, 102, 241, 0.1); /* subtle fills */

--border:           rgba(255, 255, 255, 0.06); /* subtle borders */
--border-hover:     rgba(255, 255, 255, 0.12);

--glass-bg:         rgba(17, 17, 19, 0.7);  /* glassmorphism panels */
--glass-border:     rgba(255, 255, 255, 0.08);
```

> **Note:** The accent color can be swapped to match your project's brand. Indigo is a starting point — consider your project's identity.

---

## 4. Page Sections (Top to Bottom)

### Section 1: Navigation Bar
- **Style:** Fixed top, glass background (`backdrop-blur-xl`), fades in border on scroll
- **Content:**
  - Left: Project logo/wordmark
  - Center: Nav links — Docs, Features, GitHub, Community
  - Right: GitHub stars badge + "Get Started" button
- **Animation:** Appears immediately, border reveals after 50px scroll

### Section 2: Hero
- **Style:** Full viewport height, centered content, radial gradient glow behind heading
- **Content:**
  - Eyebrow tag: version badge or tagline (e.g., `v2.0 — Now with X`)
  - Main heading: 1 powerful line (large, `text-5xl md:text-7xl`, font-bold tracking-tight)
  - Subheading: 1–2 lines explaining what the project does (`text-lg text-secondary`)
  - CTA row: "Get Started" (solid accent) + "View on GitHub" (ghost/outline)
  - Optional: terminal/code snippet showing install command
- **Animation:**
  - Staggered fade-up: badge → heading → subheading → CTAs (150ms delays)
  - Radial gradient glow pulses subtly behind the heading
  - Optional: faint grid/dot pattern in background fades as you scroll

### Section 3: Social Proof / Logos (Optional)
- **Style:** Single row, muted/grayscale logos, subtle divider lines above and below
- **Content:** "Trusted by teams at" + 4–6 logos (or GitHub stats: stars, forks, contributors)
- **Animation:** Fade in on scroll, logos slide in gently from below

### Section 4: Feature Bento Grid
- **Style:** Asymmetric grid layout (CSS Grid), glass-effect cards with subtle borders
- **Layout:** 2×2 or 3-column bento (1 large card spanning 2 cols + 2 smaller cards)
- **Content per card:**
  - Icon (Lucide) + heading + 1–2 line description
  - Optional: a subtle visual/illustration inside the card (code snippet, diagram, glow orb)
- **Animation:**
  - Cards fade-up + scale-in on scroll (staggered by 100ms each)
  - Hover: border brightens, subtle translateY(-2px) lift, glow intensifies

### Section 5: Code / Demo Showcase
- **Style:** Split layout or centered — showing either a code block or terminal output
- **Content:**
  - Left/top: brief explanation of a key workflow
  - Right/bottom: syntax-highlighted code block with glass card styling
- **Animation:**
  - Code block slides in from right, text fades in from left
  - Optional: typing animation for the code (subtle, not cheesy)

### Section 6: Feature Deep-Dives (3 items)
- **Style:** Alternating layout — text left / visual right, then swap
- **Content per item:**
  - Heading + 2–3 sentence description
  - Visual: screenshot, diagram, or animated illustration
- **Animation:** Each pair fades in on scroll-enter, visual has parallax offset

### Section 7: Open Source CTA / Community
- **Style:** Centered, wider card or full-width section with radial glow
- **Content:**
  - Heading: "Built in the open" or "Join the community"
  - Stats row: GitHub stars, contributors, downloads (animated counters)
  - CTA buttons: "Star on GitHub" + "Join Discord"
  - Optional: contributor avatar row (circular avatars, overlapping)
- **Animation:** Counter numbers animate up on scroll, avatars stagger in

### Section 8: Footer
- **Style:** Minimal, muted text, single row or 2-column
- **Content:** Project name, copyright, links (GitHub, Docs, Twitter/X, Discord)
- **Animation:** None (static, always visible)

---

## 5. Animation Strategy

### Global Scroll Reveal
Use a reusable `<Reveal>` component wrapping Framer Motion:

```tsx
// components/reveal.tsx
"use client";
import { motion } from "framer-motion";

export function Reveal({ children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}
```

### Key Animation Patterns:
| Pattern | Where Used | Details |
|---------|-----------|---------|
| Staggered fade-up | Hero, features | Children animate in sequence with 100–150ms delays |
| Scale-in | Bento cards | Start at `scale(0.95)`, ease to `scale(1)` |
| Glow pulse | Hero bg, CTA section | CSS `@keyframes` on radial gradient opacity |
| Border reveal | Nav | Conditional class based on scroll position |
| Counter | Stats section | Animate from 0 to target number over 1.5s |
| Parallax offset | Feature visuals | `useScroll` + `useTransform` for subtle y-offset |

### Performance Rules:
- `viewport={{ once: true }}` — animate only once, don't re-trigger
- Use `will-change: transform` sparingly
- Prefer `transform` and `opacity` animations only (GPU composited)
- Lazy-load images below the fold

---

## 6. Glassmorphism Recipe

```css
.glass-card {
  background: rgba(17, 17, 19, 0.6);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.03) inset,
    0 4px 24px rgba(0, 0, 0, 0.4);
}

.glass-card:hover {
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.06) inset,
    0 8px 32px rgba(0, 0, 0, 0.5);
}
```

---

## 7. File Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout, fonts, metadata
│   ├── page.tsx            # Landing page (assembles sections)
│   └── globals.css         # CSS variables, base styles
├── components/
│   ├── ui/
│   │   ├── button.tsx      # Button variants (solid, ghost, outline)
│   │   ├── badge.tsx       # Version/tag badges
│   │   ├── glass-card.tsx  # Reusable glass card
│   │   └── reveal.tsx      # Scroll animation wrapper
│   ├── sections/
│   │   ├── navbar.tsx
│   │   ├── hero.tsx
│   │   ├── logos.tsx
│   │   ├── features.tsx    # Bento grid
│   │   ├── code-showcase.tsx
│   │   ├── deep-dives.tsx
│   │   ├── community.tsx
│   │   └── footer.tsx
│   └── icons/
│       └── logo.tsx        # Project logo SVG component
├── lib/
│   └── utils.ts            # cn() helper, constants
└── public/
    └── og.png              # Open Graph image
```

---

## 8. Implementation Order

Follow this order for the best iterative workflow in Claude Code:

| Phase | Task | Why this order |
|-------|------|----------------|
| **1** | Project setup: `create-next-app`, install deps, configure Tailwind, set up `globals.css` with CSS variables | Foundation |
| **2** | `layout.tsx` — fonts, metadata, base structure | Everything inherits from this |
| **3** | Reusable components: `button`, `badge`, `glass-card`, `reveal` | Build blocks before sections |
| **4** | `navbar.tsx` + `hero.tsx` | First impression; validates the entire design direction |
| **5** | `features.tsx` (bento grid) | Core content, tests grid + glass + animations together |
| **6** | `code-showcase.tsx` | Dev-focused section, high impact for OSS project |
| **7** | `deep-dives.tsx` | Expands on features with alternating layout |
| **8** | `community.tsx` + `footer.tsx` | Closing sections |
| **9** | Polish pass: responsive breakpoints, animation timing, hover states | Refinement |
| **10** | Performance: lazy loading, image optimization, Lighthouse audit | Ship-ready |

---

## 9. Claude Code Prompt Strategy

Since you use Claude Code with the superpowers plugin and prefer planning-first, here's how to feed this plan:

1. **Share this entire plan** as context at the start of the Claude Code session
2. **Work phase-by-phase** — tell Claude Code to implement one phase at a time
3. **Review after each phase** before moving on
4. **Example prompts:**
   - Phase 1: *"Set up a new Next.js 14 project with App Router, Tailwind CSS v4, Framer Motion, and Lucide React. Configure globals.css with the CSS variables from the plan. Use Geist and Geist Mono fonts."*
   - Phase 4: *"Build the navbar and hero sections following the plan spec. The hero should have a staggered fade-up animation, radial gradient glow, and the glassmorphism recipe from the plan."*
   - Phase 9: *"Do a responsive polish pass. Ensure all sections work well at mobile (375px), tablet (768px), and desktop (1280px+). Tighten animation timings."*

---

## 10. Placeholder Content

Replace these with your actual project details:

| Field | Placeholder |
|-------|-------------|
| Project name | `YourProject` |
| Tagline | `The modern way to [solve X]` |
| Description | `An open-source [tool/library/framework] that [does Y]. Built for developers who [value Z].` |
| Install command | `npx create-yourproject@latest` |
| GitHub URL | `https://github.com/you/yourproject` |
| Feature 1 | Lightning fast — Benchmarked at Xms, faster than alternatives |
| Feature 2 | Developer-first — Designed for the tools you already use |
| Feature 3 | Type-safe — Full TypeScript support, zero runtime overhead |
| Feature 4 | Extensible — Plugin system for custom workflows |

---

## 11. Key Design Decisions Summary

- **No light mode** — ship dark only, it's part of the identity
- **Max content width: 1200px** — generous margins, nothing feels cramped
- **Section vertical padding: `py-24 md:py-32`** — breathing room between sections
- **Border radius: 16px** on cards, 12px on buttons, 8px on badges
- **Transition default: `300ms ease`** for hovers, `500ms` for scroll reveals
- **No stock images** — use code blocks, gradients, glows, and geometric shapes instead
