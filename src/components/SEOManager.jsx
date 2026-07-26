import { Helmet } from 'react-helmet-async';

/**
 * SEOManager - Reusable component to manage SEO metadata for each page
 *
 * @param {Object} props - Component props
 * @param {string} props.title - Page title (displayed in browser tab and search results)
 * @param {string} props.description - Meta description (displayed in search results)
 * @param {string} [props.canonicalUrl] - Canonical URL (defaults to https://ledgr.name.ng)
 * @param {string} [props.ogImage] - Open Graph image URL for social media sharing previews
 * @param {string} [props.keywords] - Additional keywords for SEO
 * @param {string} [props.author='Ledgr'] - Author name
 * @returns {JSX.Element}
 *
 * @example
 * <SEOManager
 *   title="Dashboard | Ledgr"
 *   description="Track income, expenses, and calculate net profit margins effortlessly."
 *   canonicalUrl="https://ledgr.name.ng/dashboard"
 *   ogImage="https://ledgr.name.ng/og-dashboard.jpg"
 *   keywords="accounting, dashboard, P&L, expenses"
 *   author="Ledgr"
 * />
 */
export function SEOManager({
  title,
  description,
  canonicalUrl,
  ogImage,
  keywords,
  author = 'Ledgr',
}) {
  // Default canonical URL to ledgr.name.ng
  const finalCanonicalUrl = canonicalUrl || 'https://ledgr.name.ng';

  // Default OG image
  const finalOgImage = ogImage || 'https://ledgr.name.ng/og-default.jpg';

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="author" content={author} />
      {keywords && <meta name="keywords" content={keywords} />}

      {/* Canonical URL for SEO */}
      <link rel="canonical" href={finalCanonicalUrl} />

      {/* Open Graph Tags for Social Media Sharing */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={finalOgImage} />
      <meta property="og:url" content={finalCanonicalUrl} />
      <meta property="og:type" content="website" />

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={finalOgImage} />

      {/* Additional Meta Tags */}
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="theme-color" content="#1e293b" />
    </Helmet>
  );
}
