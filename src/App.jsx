import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Gauge,
  Home,
  Newspaper,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

const matches = [
  {
    id: 1,
    tournament: "Madrid Masters",
    startTime: "Today 14:30",
    playerA: "Jannik Sinner",
    playerB: "Carlos Alcaraz",
    surface: "Clay",
    market: "Over 22.5 Games",
    formA: 88,
    formB: 84,
    serveHoldA: 91,
    serveHoldB: 88,
    returnEdge: 3,
    h2hEdge: -2,
    odds: "1.86",
  },
  {
    id: 2,
    tournament: "Rome WTA",
    startTime: "Today 16:00",
    playerA: "Iga Swiatek",
    playerB: "Aryna Sabalenka",
    surface: "Clay",
    market: "Swiatek to Win",
    formA: 92,
    formB: 81,
    serveHoldA: 82,
    serveHoldB: 84,
    returnEdge: 12,
    h2hEdge: 7,
    odds: "1.72",
  },
  {
    id: 3,
    tournament: "ATP 500 Barcelona",
    startTime: "Tomorrow 11:00",
    playerA: "Daniil Medvedev",
    playerB: "Taylor Fritz",
    surface: "Hard",
    market: "Fritz +1.5 Sets",
    formA: 74,
    formB: 79,
    serveHoldA: 84,
    serveHoldB: 89,
    returnEdge: -4,
    h2hEdge: -1,
    odds: "1.68",
  },
  {
    id: 4,
    tournament: "Queens Club",
    startTime: "Tomorrow 15:30",
    playerA: "Hubert Hurkacz",
    playerB: "Alex de Minaur",
    surface: "Grass",
    market: "Hurkacz to Win",
    formA: 78,
    formB: 76,
    serveHoldA: 93,
    serveHoldB: 80,
    returnEdge: -2,
    h2hEdge: 4,
    odds: "1.91",
  },
];

const players = [
  { name: "Jannik Sinner", tour: "ATP", rank: 1, form: 88, hold: 91, breakRate: 28, clay: 84, hard: 92, grass: 79, trend: "+6" },
  { name: "Carlos Alcaraz", tour: "ATP", rank: 2, form: 84, hold: 88, breakRate: 31, clay: 91, hard: 86, grass: 83, trend: "+3" },
  { name: "Iga Swiatek", tour: "WTA", rank: 1, form: 92, hold: 82, breakRate: 46, clay: 96, hard: 88, grass: 73, trend: "+8" },
  { name: "Aryna Sabalenka", tour: "WTA", rank: 2, form: 81, hold: 84, breakRate: 35, clay: 83, hard: 90, grass: 78, trend: "-2" },
  { name: "Taylor Fritz", tour: "ATP", rank: 12, form: 79, hold: 89, breakRate: 20, clay: 70, hard: 87, grass: 82, trend: "+5" },
  { name: "Alex de Minaur", tour: "ATP", rank: 9, form: 76, hold: 80, breakRate: 27, clay: 73, hard: 82, grass: 80, trend: "+1" },
];

const news = [
  {
    title: "Madrid draw creates a loaded top half",
    category: "Tournament",
    time: "12 min ago",
    summary: "Several elite returners land in the same section, which could push totals lower in early rounds and create upset value.",
  },
  {
    title: "Sinner practice reports point to full workload",
    category: "Player News",
    time: "48 min ago",
    summary: "The market has stabilized after a short injury scare, but live movement should still be watched before first serve.",
  },
  {
    title: "Clay hold rates continue to dip this week",
    category: "Market",
    time: "2 hr ago",
    summary: "Cooler conditions are slowing the court and making return games more valuable than raw serve rankings.",
  },
  {
    title: "WTA favorites covering more often on slow courts",
    category: "Trend",
    time: "4 hr ago",
    summary: "Top seeds with strong second-serve return numbers are separating earlier in sets across the current clay swing.",
  },
];

const pages = [
  { id: "home", label: "Home", icon: Home },
  { id: "predictions", label: "Predictions", icon: Target },
  { id: "stats", label: "Player Stats", icon: Users },
  { id: "news", label: "News", icon: Newspaper },
];

const surfaces = ["All", "Hard", "Clay", "Grass"];
const newsCategories = ["All", "Tournament", "Player News", "Market", "Trend"];

function getPrediction(match, modelRun) {
  const formEdge = match.formA - match.formB;
  const serveProfile = (match.serveHoldA + match.serveHoldB) / 2;
  const matchupScore = 56 + formEdge * 0.16 + serveProfile * 0.1 + match.returnEdge * 0.35 + match.h2hEdge * 0.25 + modelRun;
  const confidence = Math.max(52, Math.min(78, Math.round(matchupScore)));
  const value = confidence >= 68 ? "Strong" : confidence >= 62 ? "Positive" : "Lean";

  return { confidence, value };
}

function StatBar({ value }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-800">
      <div className="h-2 rounded-full bg-lime-400" style={{ width: `${value}%` }} />
    </div>
  );
}

function PageButton({ page, activePage, onClick }) {
  const Icon = page.icon;
  const active = activePage === page.id;

  return (
    <button
      type="button"
      onClick={() => onClick(page.id)}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-lime-400 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon size={16} />
      {page.label}
    </button>
  );
}

function Header({ activePage, setActivePage }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <button type="button" onClick={() => setActivePage("home")} className="flex w-fit items-center gap-3 text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-400 text-slate-950 shadow-lg shadow-lime-400/20">
            <Trophy size={22} />
          </span>
          <span>
            <span className="block text-xl font-bold tracking-tight">TennisTipz</span>
            <span className="block text-xs text-slate-400">dynamic tennis intelligence</span>
          </span>
        </button>
        <nav className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
          {pages.map((page) => (
            <PageButton key={page.id} page={page} activePage={activePage} onClick={setActivePage} />
          ))}
        </nav>
      </div>
    </header>
  );
}

function HomePage({ setActivePage }) {
  const featured = getPrediction(matches[0], 2);

  return (
    <>
      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.05fr_0.95fr] md:px-6 md:py-20">
        <div className="flex flex-col justify-center">
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-lime-400/30 bg-lime-400/10 px-4 py-2 text-sm text-lime-300">
            <TrendingUp size={16} /> Live model board for ATP and WTA matches
          </div>
          <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight md:text-6xl">
            Dynamic tennis predictions, stats, and market news.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            TennisTipz now organizes match projections, player performance signals, and betting-relevant news into fast, focused pages.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => setActivePage("predictions")} className="rounded-xl bg-lime-400 px-6 py-4 font-bold text-slate-950 shadow-xl shadow-lime-400/20 hover:bg-lime-300">
              View Predictions
            </button>
            <button type="button" onClick={() => setActivePage("stats")} className="rounded-xl border border-white/15 px-6 py-4 font-bold text-white hover:bg-white/10">
              Compare Players
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-500">18+. Tips are opinions, not guaranteed outcomes. Bet responsibly.</p>
        </div>

        <div className="border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30">
          <div className="bg-slate-900 p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Featured Prediction</p>
                <h2 className="text-2xl font-bold">Match of the Day</h2>
              </div>
              <div className="rounded-full bg-lime-400/10 px-3 py-1 text-sm font-bold text-lime-300">{featured.confidence}%</div>
            </div>
            <div className="bg-slate-800 p-5">
              <p className="text-lg font-bold">{matches[0].playerA} vs {matches[0].playerB}</p>
              <p className="mt-2 text-slate-300">Pick: <span className="font-semibold text-white">{matches[0].market}</span></p>
              <p className="mt-4 text-sm leading-6 text-slate-400">
                Serve hold strength, recent form and head-to-head pressure create a projected {featured.value.toLowerCase()} value angle.
              </p>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="bg-white/5 p-4">
                <p className="text-2xl font-black">{matches.length}</p>
                <p className="text-xs text-slate-400">Matches</p>
              </div>
              <div className="bg-white/5 p-4">
                <p className="text-2xl font-black">{players.length}</p>
                <p className="text-xs text-slate-400">Players</p>
              </div>
              <div className="bg-white/5 p-4">
                <p className="text-2xl font-black">{news.length}</p>
                <p className="text-xs text-slate-400">Updates</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-10 md:grid-cols-3 md:px-6">
        <button type="button" onClick={() => setActivePage("predictions")} className="border border-white/10 bg-white/[0.04] p-6 text-left hover:border-lime-400/40">
          <Target className="mb-4 text-lime-300" />
          <h3 className="text-xl font-bold">Dynamic Predictions</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">Filter by surface and refresh the model run to see confidence scores recalculate from match inputs.</p>
        </button>
        <button type="button" onClick={() => setActivePage("stats")} className="border border-white/10 bg-white/[0.04] p-6 text-left hover:border-lime-400/40">
          <BarChart3 className="mb-4 text-lime-300" />
          <h3 className="text-xl font-bold">Player Stats</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">Search, sort and compare ranking, form, hold rate, break rate and surface strength.</p>
        </button>
        <button type="button" onClick={() => setActivePage("news")} className="border border-white/10 bg-white/[0.04] p-6 text-left hover:border-lime-400/40">
          <Newspaper className="mb-4 text-lime-300" />
          <h3 className="text-xl font-bold">News Pages</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">Track tournament notes, player updates, market movement and trend stories in one feed.</p>
        </button>
      </section>
    </>
  );
}

function PredictionsPage() {
  const [surface, setSurface] = useState("All");
  const [modelRun, setModelRun] = useState(1);

  const filteredMatches = useMemo(() => {
    return matches
      .filter((match) => surface === "All" || match.surface === surface)
      .map((match) => ({ ...match, prediction: getPrediction(match, modelRun) }))
      .sort((a, b) => b.prediction.confidence - a.prediction.confidence);
  }, [surface, modelRun]);

  return (
    <section className="mx-auto max-w-7xl px-5 py-12 md:px-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-lime-300">Prediction board</p>
          <h1 className="mt-2 text-4xl font-black">Dynamic Predictions</h1>
          <p className="mt-3 max-w-2xl text-slate-400">Confidence is recalculated from form, serve hold, return edge, head-to-head pressure and the current model run.</p>
        </div>
        <button type="button" onClick={() => setModelRun((value) => (value === 4 ? -2 : value + 1))} className="inline-flex w-fit items-center gap-2 rounded-xl bg-lime-400 px-5 py-3 font-bold text-slate-950 hover:bg-lime-300">
          <Gauge size={18} /> Refresh Model
        </button>
      </div>

      <div className="mt-8 flex gap-2 overflow-x-auto">
        {surfaces.map((item) => (
          <button key={item} type="button" onClick={() => setSurface(item)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${surface === item ? "bg-white text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>
            {item}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {filteredMatches.map((match) => (
          <article key={match.id} className="border border-white/10 bg-white/[0.04] p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">{match.tournament} - {match.startTime}</p>
                <h2 className="mt-2 text-2xl font-black">{match.playerA} vs {match.playerB}</h2>
              </div>
              <span className="rounded-full bg-lime-400/10 px-3 py-1 text-sm font-bold text-lime-300">{match.prediction.confidence}%</span>
            </div>
            <p className="text-slate-300">Model pick: <span className="font-bold text-white">{match.market}</span></p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="bg-slate-900 p-4">
                <p className="text-xs text-slate-500">Surface</p>
                <p className="mt-1 font-bold">{match.surface}</p>
              </div>
              <div className="bg-slate-900 p-4">
                <p className="text-xs text-slate-500">Value</p>
                <p className="mt-1 font-bold">{match.prediction.value}</p>
              </div>
              <div className="bg-slate-900 p-4">
                <p className="text-xs text-slate-500">Odds</p>
                <p className="mt-1 font-bold">{match.odds}</p>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm text-slate-300">
              <p>Form edge: {match.formA - match.formB > 0 ? "+" : ""}{match.formA - match.formB}</p>
              <StatBar value={match.prediction.confidence} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StatsPage() {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("form");

  const filteredPlayers = useMemo(() => {
    return players
      .filter((player) => player.name.toLowerCase().includes(query.toLowerCase()) || player.tour.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => (sortKey === "rank" ? a.rank - b.rank : b[sortKey] - a[sortKey]));
  }, [query, sortKey]);

  return (
    <section className="mx-auto max-w-7xl px-5 py-12 md:px-6">
      <div>
        <p className="text-sm font-semibold uppercase text-lime-300">Player database</p>
        <h1 className="mt-2 text-4xl font-black">Player Stats</h1>
        <p className="mt-3 max-w-2xl text-slate-400">Compare form, serve reliability, return pressure and surface ratings for betting decisions.</p>
      </div>

      <div className="mt-8 grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="flex items-center gap-3 bg-white/[0.04] px-4 py-3 ring-1 ring-white/10">
          <Search size={18} className="text-slate-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player or tour" className="w-full bg-transparent text-white outline-none placeholder:text-slate-500" />
        </label>
        <select value={sortKey} onChange={(event) => setSortKey(event.target.value)} className="bg-slate-900 px-4 py-3 text-white ring-1 ring-white/10">
          <option value="form">Sort by form</option>
          <option value="rank">Sort by rank</option>
          <option value="hold">Sort by hold rate</option>
          <option value="breakRate">Sort by break rate</option>
          <option value="clay">Sort by clay</option>
          <option value="hard">Sort by hard</option>
          <option value="grass">Sort by grass</option>
        </select>
      </div>

      <div className="mt-8 overflow-hidden border border-white/10">
        <div className="hidden grid-cols-[1.4fr_0.6fr_repeat(6,0.7fr)] gap-3 bg-slate-900 px-5 py-3 text-xs font-bold uppercase text-slate-500 md:grid">
          <span>Player</span><span>Rank</span><span>Form</span><span>Hold</span><span>Break</span><span>Clay</span><span>Hard</span><span>Grass</span>
        </div>
        {filteredPlayers.map((player) => (
          <div key={player.name} className="grid gap-4 border-t border-white/10 bg-white/[0.03] px-5 py-5 md:grid-cols-[1.4fr_0.6fr_repeat(6,0.7fr)] md:items-center">
            <div>
              <p className="font-bold">{player.name}</p>
              <p className="text-sm text-slate-500">{player.tour} trend {player.trend}</p>
            </div>
            <p className="text-sm text-slate-300">#{player.rank}</p>
            {[player.form, player.hold, player.breakRate, player.clay, player.hard, player.grass].map((value, index) => (
              <div key={`${player.name}-${index}`}>
                <p className="mb-2 text-sm font-bold">{value}</p>
                <StatBar value={value} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function NewsPage() {
  const [category, setCategory] = useState("All");

  const filteredNews = useMemo(() => news.filter((item) => category === "All" || item.category === category), [category]);

  return (
    <section className="mx-auto max-w-7xl px-5 py-12 md:px-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-lime-300">Live newsroom</p>
          <h1 className="mt-2 text-4xl font-black">Tennis News</h1>
          <p className="mt-3 max-w-2xl text-slate-400">Filter updates by tournament context, player availability, market movement and trend signals.</p>
        </div>
        <CalendarDays className="text-slate-500" />
      </div>

      <div className="mt-8 flex gap-2 overflow-x-auto">
        {newsCategories.map((item) => (
          <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${category === item ? "bg-white text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>
            {item}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {filteredNews.map((item) => (
          <article key={item.title} className="border border-white/10 bg-white/[0.04] p-6 hover:border-lime-400/40">
            <div className="mb-4 flex items-center justify-between gap-3 text-sm">
              <span className="rounded-full bg-lime-400/10 px-3 py-1 font-bold text-lime-300">{item.category}</span>
              <span className="text-slate-500">{item.time}</span>
            </div>
            <h2 className="text-2xl font-black">{item.title}</h2>
            <p className="mt-4 leading-7 text-slate-400">{item.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ResponsibleFooter() {
  return (
    <footer className="border-t border-white/10 px-5 py-8 text-sm text-slate-500 md:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center gap-2 text-slate-300">
          <ShieldCheck size={18} /> Responsible Play
        </div>
        <p className="max-w-4xl">
          18+ only. Tennis predictions are analytical opinions based on available information and are not guaranteed outcomes. Betting involves risk. Never bet more than you can afford to lose.
        </p>
      </div>
    </footer>
  );
}

export default function TennisTipzApp() {
  const [activePage, setActivePage] = useState("home");

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header activePage={activePage} setActivePage={setActivePage} />
      <main>
        {activePage === "home" && <HomePage setActivePage={setActivePage} />}
        {activePage === "predictions" && <PredictionsPage />}
        {activePage === "stats" && <StatsPage />}
        {activePage === "news" && <NewsPage />}
      </main>
      <ResponsibleFooter />
    </div>
  );
}
