import { useMemo, useEffect } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { TrainerPageContent } from '@/components/TrainerPageContent';

export default function TrainerPage() {
  const { slug: paramSlug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const querySlug = searchParams.get('slug')?.trim();

  // Redirect legacy query param to clean URL
  useEffect(() => {
    if (!paramSlug && querySlug) {
      navigate(`/t/${querySlug}`, { replace: true });
    }
  }, [paramSlug, querySlug, navigate]);

  const slug = paramSlug || querySlug;

  if (!slug) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-4 text-center">
        <div className="space-y-4 max-w-xl">
          <h1 className="text-3xl font-semibold">Trainer Not Selected</h1>
          <p className="text-muted-foreground">
            Please open this page using a valid trainer link (e.g. <code>/t/trainer-name</code>).
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <TrainerPageContent slug={slug} />
    </main>
  );
}
