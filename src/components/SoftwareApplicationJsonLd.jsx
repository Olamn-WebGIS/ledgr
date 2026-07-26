import { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';

export function SoftwareApplicationJsonLd({
  url = 'https://ledgr.name.ng',
  name = 'LedgerLite',
  description = 'Free financial OS for African small businesses to track income, expenses, and real-time profits.',
  operatingSystem = 'Web, iOS, Android',
  applicationCategory = ['BusinessApplication', 'FinancialApplication'],
  price = '0',
  priceCurrency = 'NGN',
}) {
  const jsonLd = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name,
      applicationCategory,
      operatingSystem,
      description,
      offers: {
        '@type': 'Offer',
        price,
        priceCurrency,
      },
      url,
    }),
    [name, applicationCategory, operatingSystem, description, price, priceCurrency, url],
  );

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
}
