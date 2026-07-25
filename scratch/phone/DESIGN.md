---
name: Core Admin
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#5d3f3c'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#926f6b'
  outline-variant: '#e7bdb8'
  surface-tint: '#c00014'
  primary: '#ba0013'
  on-primary: '#ffffff'
  primary-container: '#e31e24'
  on-primary-container: '#fffafa'
  inverse-primary: '#ffb4ab'
  secondary: '#3e5f90'
  on-secondary: '#ffffff'
  secondary-container: '#a7c8ff'
  on-secondary-container: '#325383'
  tertiary: '#575c5f'
  on-tertiary: '#ffffff'
  tertiary-container: '#6f7478'
  on-tertiary-container: '#f8fbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad6'
  primary-fixed-dim: '#ffb4ab'
  on-primary-fixed: '#410002'
  on-primary-fixed-variant: '#93000d'
  secondary-fixed: '#d5e3ff'
  secondary-fixed-dim: '#a7c8ff'
  on-secondary-fixed: '#001b3c'
  on-secondary-fixed-variant: '#254776'
  tertiary-fixed: '#dfe3e7'
  tertiary-fixed-dim: '#c3c7cb'
  on-tertiary-fixed: '#171c1f'
  on-tertiary-fixed-variant: '#43474b'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style

This design system is built for administrative utility, prioritizing speed of comprehension and operational efficiency. The style is **Corporate / Modern**, characterized by structured information density, high-contrast functional elements, and a clinical attention to alignment. 

The aesthetic communicates reliability and precision through a "Utility First" lens. It avoids decorative flourishes in favor of meaningful whitespace and a rigid typographic hierarchy that helps users navigate complex data sets on both desktop and mobile views. The emotional response is one of confidence and control.

## Colors

The palette is anchored by a **Vibrant Red** primary color, reserved strictly for critical actions and active navigation states. This is balanced by a **Professional Deep Blue** for secondary branding and high-level headers, ensuring the interface feels established and secure.

- **Primary (Action):** Vibrant Red (#E31E24). Used for "Add" buttons, active navigation markers, and destructive actions.
- **Secondary (Brand):** Deep Blue (#002D5B). Used for typography, sidebars, and structural headers.
- **Neutral (Surface & Type):** A range of cool grays. Backgrounds use a very light tint (#F8FAFC) to reduce eye strain, while text uses Slate (#1E293B) for maximum legibility.
- **Semantic:** Green for "Online/Success" states, Amber for warnings, and Light Blue for informative tooltips.

## Typography

**Hanken Grotesk** is the sole typeface for this design system. It was chosen for its sharp, contemporary geometry and exceptional legibility in data-heavy environments. 

Large headlines utilize a tighter letter-spacing and heavier weights to command attention. Body text is kept at a comfortable 14px-16px for readability. A specialized "Label-Caps" style is used for form headers and metadata descriptors to differentiate instructions from user data.

## Layout & Spacing

The layout follows a **Fluid Grid** model with an 8px baseline rhythm. 

- **Desktop:** 12-column grid with 24px gutters. Sidebars are fixed at 280px.
- **Mobile:** Single column fluid layout. Margins are reduced to 16px to maximize screen real estate. 
- **Stacking:** Vertically, components use a 16px (md) gap to maintain distinct visual grouping. Branch listings and cards utilize 12px padding internally to keep the density high without feeling cramped.

## Elevation & Depth

Visual hierarchy is established through **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows.

- **Level 0 (Background):** Soft gray (#F8FAFC) creates a canvas.
- **Level 1 (Cards/Surface):** Pure White (#FFFFFF) with a 1px border (#E2E8F0). This provides a crisp container for content.
- **Level 2 (Interaction):** Subtle ambient shadows (Blur: 4px, Y: 2px, Opacity: 0.05) are applied only when a card is hovered or an input is focused to indicate interactivity.
- **Overlays:** Modals and dropdowns use a medium shadow (Blur: 12px, Y: 8px, Opacity: 0.1) to clearly separate them from the workspace.

## Shapes

The design system uses **Soft** geometry. A base radius of 4px (0.25rem) is applied to buttons and small inputs to maintain a professional, slightly architectural feel. 

Larger containers like branch cards or main content areas use 8px (0.5rem) to soften the overall appearance of the dashboard. Pills and status indicators (like the "Online" badge) use a fully rounded radius to distinguish them from actionable buttons.

## Components

### Buttons
- **Primary:** Solid Red (#E31E24) with white text. High-contrast, bold weight.
- **Secondary/Outline:** Deep Blue border and text with a transparent background.
- **Ghost:** No border, blue text; used for secondary actions like "Edit" or "Archive" within lists.

### Input Fields
Inputs use a white background, 1px border (#CBD5E1), and 12px internal padding. The placeholder text is a light neutral. On focus, the border shifts to the secondary Deep Blue with a soft 2px outer glow.

### Branch Cards
The core listing component. White surface, 1px light border. The title is in Deep Blue (Headline-SM), with metadata (address/yards) in Body-MD gray. Action icons (Edit/View) are grouped on the trailing edge.

### Chips & Badges
Small, fully rounded containers. Use a light green background with dark green text for "Success/Online" and light gray for "Inactive" states.

### Navigation
- **Mobile:** Bottom navigation bar with Red icons for the active state and neutral gray for inactive.
- **Desktop:** Left-hand sidebar with clear icons and Hanken Grotesk labels.