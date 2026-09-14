import type { Metadata } from "next";
import Link from "next/link";

import { Mark } from "@/components/mark";

export const metadata: Metadata = {
  title: "About",
  description: "What Halflife is, how a review session works, and what happens to your data.",
};

export default function AboutPage() {
  return (
    <article className="max-w-prose space-y-10">
      <header className="space-y-3">
        <Mark size={40} />
        <h1 className="text-3xl font-bold">What Halflife is</h1>
        <p className="text-lg muted">
          A flashcard app that decides when to show you each card again, so you spend your time on the cards you are
          about to forget and not on the ones you already know.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">How a session works</h2>
        <p>
          Pick a deck and press Review. You see the front of a card. Try to remember the back, then show the answer and
          be honest: Remembered or Forgot. That is the whole job. Space shows the answer, 1 and 2 grade it, and on a
          phone you tap.
        </p>
        <p>
          Every grade sets the day the card comes back. Remembered cards come back later each time, forgotten cards come
          back soon. A card you get right five times might rest for a month. Nothing is ever lost: every card returns
          eventually.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Who decides the day</h2>
        <p>
          Two schedulers, and you can switch in Settings. Classic is the formula most flashcard apps have used since the
          1980s. Halflife is a model that learned from thirteen million real reviews how quickly people forget, and keeps
          learning from reviews made here. The idea comes from a{" "}
          <a className="underline" href="https://doi.org/10.18653/v1/P16-1174">
            2016 paper by Duolingo
          </a>
          . Whichever you use, every card has a Why this date panel that shows the reason
          for its date in plain numbers.
        </p>
        <p>
          The model does not schedule by default yet. It only takes over once it beats the formula on real reviews from
          this app, which is a test it has to pass in public. Until then it watches and records what it would have done.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Your cards, your data</h2>
        <p>
          You can start without an account. Your decks live in this browser until you keep them with a username and a
          password. There is no email, no verification, and nothing to unsubscribe from. Instead of a password reset you
          get one recovery code, shown once. Keep it somewhere safe.
        </p>
        <p>
          Anything you make here you can take with you: every deck exports as a spreadsheet, your whole account exports
          as one file, and deleting the account deletes everything. Reviews are shared with the model as numbers only,
          never card text, and you can turn that off in Settings.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Free, and staying free</h2>
        <p>
          Halflife is one person&apos;s project, built for learning German and shared because it might help you learn
          something too. The data the model learned from does not allow commercial use, so there will never be a paid
          plan. The code is public.
        </p>
      </section>

      <p>
        <Link href="/" className="btn btn-primary">
          Start reviewing
        </Link>
      </p>

      <details id="credits" className="sheet">
        <summary className="min-h-11 cursor-pointer px-5 py-3 text-base font-semibold">Credits and licences</summary>
        <div className="space-y-3 px-5 pb-5 text-sm muted">
          <p>
            The scheduler is half-life regression from Settles, B. and Meeder, B.,{" "}
            <a className="underline" href="https://doi.org/10.18653/v1/P16-1174">
              A Trainable Spaced Repetition Model for Language Learning
            </a>
            , ACL 2016. It is trained on the{" "}
            <a className="underline" href="https://doi.org/10.7910/DVN/N8XJME">
              Duolingo learning traces
            </a>{" "}
            released with that paper, licensed CC BY-NC 4.0. The weights derive from that data, so Halflife is
            non-commercial and will stay so. The authors&apos;{" "}
            <a className="underline" href="https://github.com/duolingo/halflife-regression">
              reference implementation
            </a>{" "}
            (MIT) was the correctness check for the port.
          </p>
          <p>
            The German starter deck was built from the{" "}
            <a className="underline" href="https://github.com/hermitdave/FrequencyWords">
              FrequencyWords
            </a>{" "}
            list by Hermit Dave, derived from OpenSubtitles and licensed CC BY-SA 4.0. The deck is published under the
            same licence; the English glosses and example sentences are original to this project.
          </p>
          <p>
            Built with Next.js, FastAPI, PyTorch, Drizzle and Neon Postgres, on Vercel.{" "}
            <a className="underline" href="https://github.com/adivishnu-a/halflife">
              Source on GitHub
            </a>
            . 2026 Adi Vishnu Avula.
          </p>
        </div>
      </details>
    </article>
  );
}
