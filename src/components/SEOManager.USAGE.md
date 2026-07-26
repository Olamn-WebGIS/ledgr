# SEOManager Usage Examples - JSX

Add these `<SEOManager />` components at the top of each view in your App.jsx:

## Dashboard Page

```jsx
if (activeView === 'dashboard') {
  return (
    <>
      <SEOManager
        title="Dashboard | Ledgr - Profit & Loss Calculator"
        description="Track your business income, expenses, and calculate net profit margins in real-time. Manage your P&L effortlessly."
        canonicalUrl="https://ledgr.name.ng/dashboard"
        ogImage="https://ledgr.name.ng/og-dashboard.jpg"
        keywords="accounting, dashboard, profit and loss, financial tracking, sales traking, inventory"
        author="Ledgr"
      />
      {/* Existing dashboard JSX content */}
    </>
  );
}
```

## Inventory Page

```jsx
if (activeView === 'inventory') {
  return (
    <>
      <SEOManager
        title="Inventory | Ledgr - Stock Management"
        description="Manage your product inventory, track stock levels, and monitor product costs. Keep your business organized."
        canonicalUrl="https://ledgr.name.ng/inventory"
        ogImage="https://ledgr.name.ng/og-inventory.jpg"
        keywords="inventory, stock management, products, business"
      />
      {/* Existing inventory JSX content */}
    </>
  );
}
```

## Expenses Page

```jsx
if (activeView === 'expenses') {
  return (
    <>
      <SEOManager
        title="Expenses | Ledgr - Track Operating Costs"
        description="Categorize and track your business expenses. Analyze spending patterns and optimize your budget."
        canonicalUrl="https://ledgr.name.ng/expenses"
        ogImage="https://ledgr.name.ng/og-expenses.jpg"
        keywords="expenses, operating costs, budget tracking, business finance"
      />
      {/* Existing expenses JSX content */}
    </>
  );
}
```

## P&L Report Page

```jsx
if (activeView === 'pnl') {
  return (
    <>
      <SEOManager
        title="P&L Report | Ledgr - Profit & Loss Analysis"
        description="View detailed profit and loss reports. Analyze revenue, costs, and profitability with interactive charts."
        canonicalUrl="https://ledgr.name.ng/pnl"
        ogImage="https://ledgr.name.ng/og-pnl.jpg"
        keywords="profit loss, financial reports, revenue analysis, business analytics"
      />
      {/* Existing P&L JSX content */}
    </>
  );
}
```

## Settings Page

```jsx
if (activeView === 'settings') {
  return (
    <>
      <SEOManager
        title="Settings | Ledgr - Account & Workspace"
        description="Configure your Ledgr account, manage workspace settings, and customize your preferences."
        canonicalUrl="https://ledgr.name.ng/settings"
        ogImage="https://ledgr.name.ng/og-settings.jpg"
        keywords="settings, account, workspace, preferences"
      />
      {/* Existing settings JSX content */}
    </>
  );
}
```

## Home/Landing Page (if applicable)

```jsx
if (activeView === 'home') {
  return (
    <>
      <SEOManager
        title="Ledgr - Simple Profit & Loss Calculator"
        description="Track income, expenses, and calculate net profit margins effortlessly. Manage your business finances with ease."
        canonicalUrl="https://ledgr.name.ng"
        ogImage="https://ledgr.name.ng/og-home.jpg"
        keywords="profit calculator, expense tracker, financial management, business accounting"
      />
      {/* Existing home JSX content */}
    </>
  );
}
```

## Implementation Checklist

- [ ] Import `SEOManager` at the top of App.jsx: `import { SEOManager } from './components/SEOManager';`
- [ ] Add `<SEOManager />` component inside each view's return statement
- [ ] Replace placeholder image URLs with your actual OG image paths
- [ ] Test with [Meta Tags Inspector](https://metatags.io/)
- [ ] Create OG images (recommended size: 1200x630px)
- [ ] Verify in browser DevTools that `<head>` contains all meta tags

## Default Behavior

If you don't provide optional props:
- `canonicalUrl` → defaults to `https://ledgr.name.ng`
- `ogImage` → defaults to `https://ledgr.name.ng/og-default.jpg`
- `author` → defaults to `Ledgr`
