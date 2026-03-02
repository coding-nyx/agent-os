import { ClientRouter } from '@/components/ClientRouter';

// Required for output: 'export'
export function generateStaticParams() {
  return [{ slug: [] }];
}

export default function Page() {
  return <ClientRouter />;
}
