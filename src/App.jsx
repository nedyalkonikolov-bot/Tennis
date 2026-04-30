import React from "react";
import { Trophy, TrendingUp, ShieldCheck, CalendarDays, Lock, BarChart3 } from "lucide-react";

const tips = [
  {
    match: "Jannik Sinner vs Carlos Alcaraz",
    pick: "Over 22.5 Games",
    confidence: "68%",
    surface: "Clay",
    note: "Both players hold well and recent meetings suggest a tight match."
  },
  {
    match: "Iga Swiatek vs Aryna Sabalenka",
    pick: "Swiatek to Win",
    confidence: "64%",
    surface: "Clay",
    note: "Surface advantage and stronger return game make her the lean."
  },
  {
    match: "Daniil Medvedev vs Taylor Fritz",
    pick: "Fritz +1.5 Sets",
    confidence: "61%",
    surface: "Hard",
    note: "Value angle based on serve strength and recent form."
  }
];

const articles = [
  "How to read tennis odds before placing a bet",
  "Why surface matters: clay, grass and hard court betting angles",
  "Tennis bankroll basics for beginners"
];

export default function TennisTipzHomepage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lime-400 text-slate-950 shadow-lg shadow-lime-400/20">
              <Trophy size={22} />
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">TennisTipz</p>
              <p className="text-xs text-slate-400">tennistipz.win</p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#tips" className="hover:text-white">Today&apos;s Tips</a>
            <a href="#analysis" className="hover:text-white">Analysis</a>
            <a href="#premium" className="hover:text-white">Premium</a>
            <a href="#responsible" className="hover:text-white">Responsible Play</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 md:grid-cols-[1.1fr_0.9fr] md:py-24">
          <div className="flex flex-col justify-center">
            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-lime-400/30 bg-lime-400/10 px-4 py-2 text-sm text-lime-300">
              <TrendingUp size={16} /> Daily tennis predictions and betting analysis
            </div>
            <h1 className="max-w-3xl text-5xl font-black leading-tight tracking-tight md:text-7xl">
              Smarter tennis tips, backed by form, surface and value.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              TennisTipz gives you clear match previews, confidence ratings and value-based picks for ATP and WTA matches — without fake guarantees or hype.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#tips" className="rounded-2xl bg-lime-400 px-6 py-4 text-center font-bold text-slate-950 shadow-xl shadow-lime-400/20 hover:bg-lime-300">
                View Today&apos;s Tips
              </a>
              <a href="#premium" className="rounded-2xl border border-white/15 px-6 py-4 text-center font-bold text-white hover:bg-white/10">
                Join Premium
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-500">18+. Tips are opinions, not guaranteed outcomes. Bet responsibly.</p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/30">
            <div className="rounded-[1.5rem] bg-slate-900 p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Featured Pick</p>
                  <h2 className="text-2xl font-bold">Match of the Day</h2>
                </div>
                <div className="rounded-full bg-lime-400/10 px-3 py-1 text-sm font-bold text-lime-300">68%</div>
              </div>
              <div className="rounded-2xl bg-slate-800 p-5">
                <p className="text-lg font-bold">Sinner vs Alcaraz</p>
                <p className="mt-2 text-slate-300">Pick: <span className="font-semibold text-white">Over 22.5 Games</span></p>
                <p className="mt-4 text-sm leading-6 text-slate-400">
                  A tight matchup profile with strong service games, elite baseline defence and high probability of one extended set.
                </p>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-2xl font-black">64%</p>
                  <p className="text-xs text-slate-400">Last 30 days</p>
                </div>
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-2xl font-black">ATP/WTA</p>
                  <p className="text-xs text-slate-400">Coverage</p>
                </div>
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-2xl font-black">Daily</p>
                  <p className="text-xs text-slate-400">Updates</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="tips" className="mx-auto max-w-7xl px-6 py-14">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-lime-300">Today&apos;s card</p>
              <h2 className="mt-2 text-3xl font-black md:text-4xl">Free Tennis Tips</h2>
            </div>
            <CalendarDays className="text-slate-500" />
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {tips.map((tip) => (
              <article key={tip.match} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-6 shadow-xl shadow-black/20">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">{tip.surface}</span>
                  <span className="rounded-full bg-lime-400/10 px-3 py-1 text-xs font-bold text-lime-300">{tip.confidence}</span>
                </div>
                <h3 className="text-xl font-bold">{tip.match}</h3>
                <p className="mt-3 text-slate-300">Pick: <span className="font-semibold text-white">{tip.pick}</span></p>
                <p className="mt-4 text-sm leading-6 text-slate-400">{tip.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="analysis" className="mx-auto grid max-w-7xl gap-6 px-6 py-14 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-6">
            <BarChart3 className="mb-4 text-lime-300" />
            <h3 className="text-xl font-bold">Form-based analysis</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">Recent results, hold/break patterns, ranking movement and matchup style.</p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-6">
            <Trophy className="mb-4 text-lime-300" />
            <h3 className="text-xl font-bold">Surface angles</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">Clay, grass and hard court trends matter more in tennis than most sports.</p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-6">
            <ShieldCheck className="mb-4 text-lime-300" />
            <h3 className="text-xl font-bold">No fake guarantees</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">We publish probabilities, not promises. The goal is smart decisions, not hype.</p>
          </div>
        </section>

        <section id="premium" className="mx-auto max-w-7xl px-6 py-14">
          <div className="rounded-[2rem] border border-lime-400/20 bg-gradient-to-br from-lime-400/10 to-white/5 p-8 md:p-10">
            <div className="grid gap-8 md:grid-cols-[1fr_0.8fr]">
              <div>
                <div className="mb-4 flex items-center gap-2 text-lime-300">
                  <Lock size={18} /> Premium coming soon
                </div>
                <h2 className="text-3xl font-black md:text-5xl">Get full daily cards and deeper match previews.</h2>
                <p className="mt-5 max-w-2xl text-slate-300">
                  Premium will include extra picks, confidence tiers, odds movement notes, staking suggestions and a private community.
                </p>
              </div>
              <div className="rounded-[1.5rem] bg-slate-950/60 p-6">
                <p className="text-sm text-slate-400">Planned price</p>
                <p className="mt-2 text-5xl font-black">€9<span className="text-base font-medium text-slate-400">/month</span></p>
                <ul className="mt-5 space-y-3 text-sm text-slate-300">
                  <li>✓ Full ATP/WTA daily tips</li>
                  <li>✓ Match reasoning</li>
                  <li>✓ Confidence ratings</li>
                  <li>✓ Telegram/Discord access</li>
                </ul>
                <button className="mt-6 w-full rounded-2xl bg-lime-400 px-5 py-4 font-bold text-slate-950 hover:bg-lime-300">
                  Join Waitlist
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-14">
          <h2 className="text-3xl font-black">Latest Guides</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {articles.map((title) => (
              <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="font-bold">{title}</p>
                <p className="mt-3 text-sm text-slate-400">Read guide →</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer id="responsible" className="border-t border-white/10 px-6 py-8 text-sm text-slate-500">
        <div className="mx-auto max-w-7xl">
          <p className="font-semibold text-slate-300">TennisTipz.win</p>
          <p className="mt-2 max-w-4xl">
            18+ only. Tennis tips are analytical opinions based on publicly available information and are not guaranteed outcomes. Betting involves risk. Never bet more than you can afford to lose. If gambling stops being fun, seek help and use self-exclusion tools where available.
          </p>
        </div>
      </footer>
    </div>
  );
}
