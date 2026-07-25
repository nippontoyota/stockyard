---
name: Logistics Precision
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#5f3f3a'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#946e68'
  outline-variant: '#e9bcb5'
  surface-tint: '#c00000'
  primary: '#b70100'
  on-primary: '#ffffff'
  primary-container: '#e60000'
  on-primary-container: '#fff7f5'
  inverse-primary: '#ffb4a8'
  secondary: '#5d5e61'
  on-secondary: '#ffffff'
  secondary-container: '#e2e2e5'
  on-secondary-container: '#636467'
  tertiary: '#58595d'
  on-tertiary: '#ffffff'
  tertiary-container: '#707275'
  on-tertiary-container: '#f8f8fb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad4'
  primary-fixed-dim: '#ffb4a8'
  on-primary-fixed: '#410000'
  on-primary-fixed-variant: '#930100'
  secondary-fixed: '#e2e2e5'
  secondary-fixed-dim: '#c6c6c9'
  on-secondary-fixed: '#1a1c1e'
  on-secondary-fixed-variant: '#454749'
  tertiary-fixed: '#e2e2e6'
  tertiary-fixed-dim: '#c5c6ca'
  on-tertiary-fixed: '#191c1e'
  on-tertiary-fixed-variant: '#45474a'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
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
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-max: 1200px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The design system is engineered for operational efficiency, transparency, and reliability. It evolves the legacy "Admin Console" look into a high-performance **Corporate Modern** workspace. The personality is functional and authoritative, ensuring that complex hierarchical data (branches and yards) remains digestible and actionable.

The aesthetic prioritizes clarity through:
- **Utilitarian Minimalism:** Generous white space and a restricted color palette to reduce cognitive load during data management.
- **Structural Integrity:** Use of subtle tonal layering and crisp borders to define logical groupings.
- **Action-Oriented Accents:** The primary red is reserved strictly for high-priority actions and brand signifiers, ensuring it draws focus exactly where needed.

## Colors

This color palette is designed to maximize legibility and professional rigor.

- **Primary Red (#E60000):** Derived from the legacy 'Add' button, used for primary CTAs, active navigation states, and critical alerts.
- **Deep Onyx (#1A1C1E):** Used for primary headings and high-contrast text to ensure maximum readability against the light background.
- **Cool Slate (#45474A):** Employed for secondary information, supporting text, and icon outlines to maintain hierarchy without competing for attention.
- **Foundation White (#FFFFFF) & Surface Grey (#F8F9FA):** These form the base of the UI, creating a clean environment that allows the content to breathe.

## Typography

The design system utilizes **Hanken Grotesk** across all interfaces. It provides a sharp, contemporary look with excellent legibility in data-dense tables and lists.

- **Headlines:** Use Bold and SemiBold weights to establish clear section boundaries.
- **Body:** Regular weight is used for general content, while Medium is reserved for emphasizing specific data points within lists.
- **Labels:** Use uppercase for field titles and metadata to distinguish them from user-generated content.
- **Mobile Scale:** For screens under 600px, `headline-lg` should scale down to 24px and `headline-md` to 20px.

## Layout & Spacing

The layout follows a **Fixed-Fluid Hybrid** model. The main content container is capped at 1200px for optimal readability on wide monitors, centering itself within the viewport.

- **Grid:** A 12-column grid is used for dashboard layouts.
- **Branch Lists:** Elements within the branch management view are vertically stacked using a 4px-based rhythm.
- **Safe Margins:** Use 32px margins on desktop to prevent content from feeling cramped against the browser edges. On mobile, this reduces to 16px.
- **Density:** Provide high information density for administrative tasks while using `stack-lg` (32px) to separate distinct branch entities.

## Elevation & Depth

To maintain a professional, flat aesthetic, this design system avoids heavy shadows. Hierarchy is instead conveyed through:

- **Tonal Layers:** The background uses `#F8F9FA`, while active cards or input containers use `#FFFFFF`.
- **Low-Contrast Outlines:** Subtle 1px borders in a soft grey (`#E2E4E7`) define the bounds of cards and list items.
- **Focus States:** When an element is interacted with, use a 2px Primary Red outline or a very soft, diffused red glow to indicate focus without breaking the flat visual language.

## Shapes

The shape language is **Soft**, leaning toward a professional and precise feel. 

- **Standard Elements:** Buttons, input fields, and cards utilize a 0.25rem (4px) radius.
- **Status Indicators:** Small "Online" or "Offline" indicators use `rounded-xl` (pill-shape) to distinguish them from interactive buttons.
- **Icons:** Should follow a 2px stroke weight with slight corner rounding to match the UI elements.

## Components

### Buttons
- **Primary:** Solid Primary Red with white text. High contrast, 4px radius.
- **Secondary/Ghost:** Transparent background with a 1px Slate border or just text for "Edit" actions.
- **Icon Buttons:** Square 32x32px or 40x40px containers with centered icons for actions like "Delete" or "Download".

### Branch Cards
Instead of the current loose text, each branch should be housed in a white card.
- **Header:** Contains the Branch Name in `headline-sm` and a "Manage Yards" button.
- **Content Area:** Lists assigned yards as small, subtle chips or a simple bulleted list in `body-md`.
- **Footer/Actions:** Subtle "Edit" and "Archive" icons aligned to the right.

### Input Fields
- **Search & Add:** Large, clear inputs with a light grey border. Upon focus, the border transitions to Primary Red. Labels should sit above the field in `label-md`.

### Navigation
- **Bottom Bar:** As seen in the reference, the mobile/tablet navigation uses a high-contrast red for the active state. Maintain this "Tab" style for the primary app navigation, using clear line-icons.

### Chips & Badges
- Used for "Yards" within a "Branch". Use a very light grey background with `label-sm` text to keep them unobtrusive.