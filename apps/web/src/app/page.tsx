import { screenCopy } from '@greenci/core';
export default function Home() {
  // This is generated only from the committed, trusted screen reference; no user content is interpolated.
  return <main dangerouslySetInnerHTML={{ __html: screenCopy.landingHtml }} />;
}
