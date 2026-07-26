# SEOManager Integration Guide

## Installation ✅

The package `react-helmet-async` has been installed and the `HelmetProvider` has been added to your `main.jsx`.

## What's Included

### 1. **SEOManager Component** (`src/components/SEOManager.tsx`)

A strictly-typed TypeScript component that manages all SEO metadata for your pages.

#### Props:

```typescript
interface SEOManagerProps {
  title: string;              // Page title (browser tab + search results)
  description: string;        // Meta description (search results)
  canonicalUrl?: string;      // Canonical URL (defaults to https://ledgr.name.ng)
  ogImage?: string;          // Open Graph image (social media sharing)
  keywords?: string;         // SEO keywords (optional)
  author?: string;           // Author name (defaults to 'Ledgr')
}
```

### 2. **Usage Examples** (`src/components/SEOManager.examples.ts`)

Pre-configured examples for all your pages:
- Dashboard
- Inventory
- Expenses
- P&L Report
- Settings
- Home/Landing

## How to Use

### Quick Integration in App.jsx

Add the SEOManager at the top of your main render section:

```tsx
import { SEOManager } from './components/SEOManager';

export default function App() {
  // ... your existing code ...

  // Inside your return statement, add based on activeView:
  if (activeView === 'dashboard') {
    return (
      <>
        <SEOManager
          title="Dashboard | Ledgr - Profit & Loss Calculator"
          description="Track your business income, expenses, and calculate net profit margins in real-time."
          canonicalUrl="https://ledgr.name.ng/dashboard"
          ogImage="https://ledgr.name.ng/og-dashboard.jpg"
        />
        {/* Dashboard JSX */}
      </>
    );
  }

  if (activeView === 'inventory') {
    return (
      <>
        <SEOManager
          title="Inventory | Ledgr - Stock Management"
          description="Manage your product inventory and track stock levels."
          canonicalUrl="https://ledgr.name.ng/inventory"
          ogImage="https://ledgr.name.ng/og-inventory.jpg"
        />
        {/* Inventory JSX */}
      </>
    );
  }

  // ... add for other views ...
}
```

## SEO Tags Generated

The component automatically adds:

✅ **Basic Meta Tags**
- `<title>` - Page title
- `<meta name="description">` - Description
- `<meta name="author">` - Author
- `<meta name="keywords">` - Keywords

✅ **Open Graph Tags** (Social Media Sharing)
- `og:title`, `og:description`, `og:image`, `og:url`, `og:type`

✅ **Twitter Card Tags**
- `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`

✅ **Canonical URL**
- Prevents duplicate content issues with search engines

## Default Behavior

```typescript
// If canonicalUrl is not provided, defaults to:
https://ledgr.name.ng

// If ogImage is not provided, defaults to:
https://ledgr.name.ng/og-default.jpg
```

## SEO Best Practices

1. **Unique Titles**: Each page should have a unique, descriptive title (50-60 characters)
2. **Unique Descriptions**: Write compelling meta descriptions (150-160 characters)
3. **Canonical URLs**: Always provide explicit canonical URLs for each page
4. **OG Images**: Use high-quality images (1200x630px recommended) for social sharing
5. **Keywords**: Include relevant keywords but avoid keyword stuffing

## Next Steps

1. Update your `App.jsx` to wrap each view with `<SEOManager />`
2. Create OG images for each page (recommended 1200x630px)
3. Test your SEO setup using:
   - [Meta Tags Inspector](https://metatags.io/)
   - [Twitter Card Validator](https://cards-dev.twitter.com/validator)
   - [Open Graph Debugger](https://developers.facebook.com/tools/debug/)

## Testing

To verify tags are rendering correctly:
1. Right-click on your page → "View Page Source"
2. Search for meta tags in the `<head>` section
3. All SEOManager tags should be visible when page is rendered

---

**Note**: The component uses `react-helmet-async` which is asynchronous and safe for SSR environments.
