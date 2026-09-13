export default function Home() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <h1 className="text-3xl font-semibold">Halflife</h1>
      <p className="mt-4 text-lg leading-relaxed">
        A spaced-repetition study tool whose review scheduler is a trained model. It predicts the
        half-life of each memory and schedules the next review for the moment recall falls to your
        target.
      </p>
      <p className="mt-4 text-lg leading-relaxed">The app is being built. The model is trained.</p>
      <footer className="mt-16 text-sm leading-relaxed">
        Model trained on the Duolingo learning traces: Settles and Meeder, A Trainable Spaced
        Repetition Model for Language Learning, ACL 2016,{" "}
        <a className="underline underline-offset-2" href="https://doi.org/10.7910/DVN/N8XJME">
          doi:10.7910/DVN/N8XJME
        </a>
        , CC BY-NC 4.0. Non-commercial.
      </footer>
    </main>
  );
}
