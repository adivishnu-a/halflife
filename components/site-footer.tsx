export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-3xl px-4 py-6 text-xs leading-relaxed muted sm:px-6">
        <p>
          Scheduler from Settles and Meeder,{" "}
          <a className="underline" href="https://doi.org/10.18653/v1/P16-1174">
            A Trainable Spaced Repetition Model for Language Learning
          </a>
          , ACL 2016, trained on their{" "}
          <a className="underline" href="https://doi.org/10.7910/DVN/N8XJME">
            Duolingo learning traces
          </a>
          , CC BY-NC 4.0. Halflife is non-commercial.
        </p>
        <p className="mt-2">
          Starter German deck built from{" "}
          <a className="underline" href="https://github.com/hermitdave/FrequencyWords">
            FrequencyWords
          </a>{" "}
          by Hermit Dave, CC BY-SA 4.0. Built with Next.js, FastAPI and PyTorch.{" "}
          <a className="underline" href="https://github.com/adivishnu-a/halflife">
            Source on GitHub
          </a>
          . 2026 Adi Vishnu Avula.{" "}
          <a className="underline" href="/about">
            About Halflife
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
