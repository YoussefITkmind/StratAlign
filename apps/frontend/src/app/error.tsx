"use client";

type ErrorPageProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <main>
      <section>
        <h1>Something went wrong</h1>
        <p>{error.message || "An unexpected error occurred."}</p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}