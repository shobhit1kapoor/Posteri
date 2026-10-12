export default function sitemap() {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  return [{ url: siteUrl, lastModified: new Date() }];
}
