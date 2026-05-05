import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ExternalLink,
  Gauge,
  Home,
  Newspaper,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { fallbackMatches, fallbackNews, fallbackPlayers } from "./data/fallbackData";

const pages = [
  { id: "home", label: "Home", icon: Home },
  { id: "predictions", label: "Predictions", icon: Target },
  { id: "stats", label: "Player Stats", icon: Users },
  { id: "news", label: "News", icon: Newspaper },
];

const surfaces = ["All", "Hard", "Clay", "Grass"];
const tours = ["ATP", "WTA"];
const matchCategories = [
  { id: "live", label: "Live" },
  { id: "upcoming", label: "Upcoming" },
];
const newsCategories = ["All", "Setup", "News", "Tournament", "Player News", "Market", "Trend"];
const defaultBetUrl = "https://www.cloudbet.com/en/sports/tennis";

const initialLiveData = {
  generatedAt: null,
  source: { tennis: "fallback", odds: "fallback", news: "fallback" },
  betUrl: defaultBetUrl,
  matches: fallbackMatches,
  players: fallbackPlayers,
  news: fallbackNews,
  errors: [],
};

function getPrediction(match, modelRun = 0) {
  const baseConfidence = Number(match.confidence) || 55;
  const confidence = Math.max(51, Math.min(84, Math.round(baseConfidence + modelRun)));
  const pick = match.predictedWinner || match.market || "Value watch";
  const value = confidence >= 70 ? "Strong" : confidence >= 63 ? "Positive" : "Lean";

  return { confidence, pick, value };
}

function getAnticipationScore(match) {
  const recentMatches = (Number(match.recentA?.matches) || 0) + (Number(match.recentB?.matches) || 0);
  const hasCloudbetOdds = match.oddsSource === "Cloudbet" && match.predictedWinnerOdds && match.predictedWinnerOdds !== "N/A";
  const statusBoost = match.live ? 8 : 0;
  const oddsBoost = hasCloudbetOdds ? 15 : 0;
  const tourBoost = ["ATP", "WTA"].includes(match.tour) ? 4 : 0;

  return (Number(match.confidence) || 0) + Math.min(recentMatches, 30) * 0.7 + oddsBoost + statusBoost + tourBoost;
}

function formatUpdatedAt(value) {
  if (!value) return "Using fallback data";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function StatBar({ value }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div className="h-2 w-full rounded-full bg-slate-800">
      <div className="h-2 rounded-full bg-lime-400" style={{ width: `${safeValue}%` }} />
    </div>
  );
}

function NewsImage({ item }) {
  if (item.imageUrl) {
    return (
      <img
        src={item.imageUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-48 w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-48 w-full items-center justify-center bg-slate-900">
      <Newspaper size={42} className="text-lime-300/70" />
    </div>
  );
}

function DataStatus({ liveData, loading, error, onRefresh }) {
  return (
    <div className="border-b border-white/10 bg-slate-900/60 px-5 py-3 text-sm text-slate-400 md:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-white/5 px-3 py-1">Tennis: {liveData.source.tennis}</span>
          <span className="rounded-full bg-white/5 px-3 py-1">Odds: {liveData.source.odds || "fallback"}</span>
          <span className="rounded-full bg-white/5 px-3 py-1">News: {liveData.source.news}</span>
          <span>Updated {formatUpdatedAt(liveData.generatedAt)}</span>
          {error && <span className="text-amber-300">{error}</span>}
        </div>
        <button type="button" onClick={onRefresh} className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-white hover:bg-white/10">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh live data
        </button>
      </div>
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
            <span className="block text-xs text-slate-400">live tennis predictions</span>
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

function HomePage({ setActivePage, liveData }) {
  const featuredMatch = liveData.matches[0] || fallbackMatches[0];
  const featured = getPrediction(featuredMatch, 0);

  return (
    <>
      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.05fr_0.95fr] md:px-6 md:py-20">
        <div className="flex flex-col justify-center">
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-lime-400/30 bg-lime-400/10 px-4 py-2 text-sm text-lime-300">
            <TrendingUp size={16} /> Cloudbet odds plus last-100-days form
          </div>
          <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight md:text-6xl">
            Live tennis predictions, stats, and market news.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            TennisTipz combines live fixtures, 100-day player form, top-150 ATP/WTA rankings, Cloudbet prices and Tennis.com headlines.
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
              <p className="text-lg font-bold">{featuredMatch.playerA} vs {featuredMatch.playerB}</p>
              <p className="mt-2 text-slate-300">Winner: <span className="font-semibold text-white">{featured.pick}</span></p>
              <p className="mt-2 text-slate-300">Odds: <span className="font-semibold text-white">{featuredMatch.predictedWinnerOdds || featuredMatch.odds}</span></p>
              <p className="mt-4 text-sm leading-6 text-slate-400">
                Model based on last-100-days results where available. Odds source: {featuredMatch.oddsSource || "N/A"}.
              </p>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="bg-white/5 p-4">
                <p className="text-2xl font-black">{liveData.matches.length}</p>
                <p className="text-xs text-slate-400">Matches</p>
              </div>
              <div className="bg-white/5 p-4">
                <p className="text-2xl font-black">{liveData.players.length}</p>
                <p className="text-xs text-slate-400">Players</p>
              </div>
              <div className="bg-white/5 p-4">
                <p className="text-2xl font-black">{liveData.news.length}</p>
                <p className="text-xs text-slate-400">Updates</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-10 md:grid-cols-3 md:px-6">
        <button type="button" onClick={() => setActivePage("predictions")} className="border border-white/10 bg-white/[0.04] p-6 text-left hover:border-lime-400/40">
          <Target className="mb-4 text-lime-300" />
          <h3 className="text-xl font-bold">Live and Upcoming</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">Prediction cards are grouped by status and sorted by the most anticipated matches first.</p>
        </button>
        <button type="button" onClick={() => setActivePage("stats")} className="border border-white/10 bg-white/[0.04] p-6 text-left hover:border-lime-400/40">
          <BarChart3 className="mb-4 text-lime-300" />
          <h3 className="text-xl font-bold">Top 150 ATP/WTA</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">Separate rankings tables for ATP and WTA with points, movement and rating signals.</p>
        </button>
        <button type="button" onClick={() => setActivePage("news")} className="border border-white/10 bg-white/[0.04] p-6 text-left hover:border-lime-400/40">
          <Newspaper className="mb-4 text-lime-300" />
          <h3 className="text-xl font-bold">News Feed</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">Track player availability, tournament notes and market-relevant tennis headlines.</p>
        </button>
      </section>
    </>
  );
}

function OddsLink({ match, fallbackBetUrl }) {
  const href = match.betUrl || fallbackBetUrl || defaultBetUrl;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer sponsored"
      className="group block bg-slate-900 p-4 ring-1 ring-lime-400/20 transition hover:bg-lime-400 hover:text-slate-950"
    >
      <span className="flex items-center justify-between gap-3 text-xs text-slate-500 group-hover:text-slate-800">
        Cloudbet odds
        <ExternalLink size={14} />
      </span>
      <span className="mt-1 block font-bold">{match.predictedWinnerOdds || match.odds || "N/A"}</span>
      <span className="mt-1 block text-xs text-slate-500 group-hover:text-slate-800">{match.oddsSource || "Cloudbet"}</span>
    </a>
  );
}

function PredictionsPage({ matches, betUrl }) {
  const [surface, setSurface] = useState("All");
  const [category, setCategory] = useState("upcoming");
  const [modelRun, setModelRun] = useState(0);

  const categoryCounts = useMemo(() => ({
    live: matches.filter((match) => match.live).length,
    upcoming: matches.filter((match) => !match.live).length,
  }), [matches]);
  const effectiveCategory = categoryCounts[category] ? category : categoryCounts.upcoming ? "upcoming" : "live";

  const filteredMatches = useMemo(() => {
    return matches
      .filter((match) => (effectiveCategory === "live" ? match.live : !match.live))
      .filter((match) => surface === "All" || match.surface === surface)
      .map((match) => ({ ...match, prediction: getPrediction(match, modelRun), anticipation: getAnticipationScore(match) }))
      .sort((a, b) => b.anticipation - a.anticipation || b.prediction.confidence - a.prediction.confidence);
  }, [matches, effectiveCategory, surface, modelRun]);

  return (
    <section className="mx-auto max-w-7xl px-5 py-12 md:px-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-lime-300">Prediction board</p>
          <h1 className="mt-2 text-4xl font-black">Winner Predictions</h1>
          <p className="mt-3 max-w-2xl text-slate-400">Live and upcoming matches are separated, with the most anticipated predictions ranked first using form, confidence, status and available Cloudbet odds.</p>
        </div>
        <button type="button" onClick={() => setModelRun((value) => (value === 3 ? -2 : value + 1))} className="inline-flex w-fit items-center gap-2 rounded-xl bg-lime-400 px-5 py-3 font-bold text-slate-950 hover:bg-lime-300">
          <Gauge size={18} /> Re-run Model
        </button>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {matchCategories.map((item) => (
          <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`rounded-xl px-5 py-2 text-sm font-bold ${effectiveCategory === item.id ? "bg-lime-400 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>
            {item.label} ({categoryCounts[item.id] || 0})
          </button>
        ))}
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto">
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
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${match.live ? "bg-red-500/15 text-red-200" : "bg-sky-400/10 text-sky-200"}`}>
                {match.live ? "Live" : "Upcoming"}
              </span>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">Anticipation {Math.round(match.anticipation)}</span>
            </div>
            <p className="mt-5 text-slate-300">Predicted winner: <span className="font-bold text-white">{match.prediction.pick}</span></p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <OddsLink match={match} fallbackBetUrl={betUrl} />
              <div className="bg-slate-900 p-4">
                <p className="text-xs text-slate-500">{match.playerA} 100d</p>
                <p className="mt-1 font-bold">{match.recentA?.wins || 0}-{match.recentA?.losses || 0}</p>
                <p className="mt-1 text-xs text-slate-500">{match.recentA?.winRate || 50}% win rate</p>
              </div>
              <div className="bg-slate-900 p-4">
                <p className="text-xs text-slate-500">{match.playerB} 100d</p>
                <p className="mt-1 font-bold">{match.recentB?.wins || 0}-{match.recentB?.losses || 0}</p>
                <p className="mt-1 text-xs text-slate-500">{match.recentB?.winRate || 50}% win rate</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="bg-slate-900 p-4">
                <p className="text-xs text-slate-500">Surface</p>
                <p className="mt-1 font-bold">{match.surface}</p>
              </div>
              <div className="bg-slate-900 p-4">
                <p className="text-xs text-slate-500">Status</p>
                <p className="mt-1 font-bold">{match.live ? "Live" : match.status}</p>
              </div>
              <div className="bg-slate-900 p-4">
                <p className="text-xs text-slate-500">Score</p>
                <p className="mt-1 font-bold">{match.score || "Pre-match"}</p>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm text-slate-300">
              <p>100-day form edge: {(match.formA || 0) - (match.formB || 0) > 0 ? "+" : ""}{(match.formA || 0) - (match.formB || 0)}</p>
              <StatBar value={match.prediction.confidence} />
            </div>
          </article>
        ))}
      </div>

      {!filteredMatches.length && (
        <div className="mt-8 border border-white/10 bg-white/[0.04] p-8 text-slate-400">
          No Cloudbet tennis betting matches found right now.
        </div>
      )}
    </section>
  );
}

function StatsPage({ players }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("rank");
  const [activeTour, setActiveTour] = useState("ATP");

  const filteredPlayers = useMemo(() => {
    return players
      .filter((player) => (player.sex || player.tour) === activeTour)
      .filter((player) => player.name.toLowerCase().includes(query.toLowerCase()) || player.country?.toLowerCase?.().includes(query.toLowerCase()))
      .sort((a, b) => (sortKey === "rank" ? a.rank - b.rank : b[sortKey] - a[sortKey]));
  }, [players, activeTour, query, sortKey]);

  return (
    <section className="mx-auto max-w-7xl px-5 py-12 md:px-6">
      <div>
        <p className="text-sm font-semibold uppercase text-lime-300">Player database</p>
        <h1 className="mt-2 text-4xl font-black">Player Stats</h1>
        <p className="mt-3 max-w-2xl text-slate-400">Top 150 ATP and top 150 WTA players, split by tour with ranking points and rating signals.</p>
      </div>

      <div className="mt-8 flex gap-2 overflow-x-auto">
        {tours.map((tour) => (
          <button key={tour} type="button" onClick={() => setActiveTour(tour)} className={`rounded-xl px-5 py-2 text-sm font-bold ${activeTour === tour ? "bg-lime-400 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>
            {tour} Top 150
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="flex items-center gap-3 bg-white/[0.04] px-4 py-3 ring-1 ring-white/10">
          <Search size={18} className="text-slate-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player or country" className="w-full bg-transparent text-white outline-none placeholder:text-slate-500" />
        </label>
        <select value={sortKey} onChange={(event) => setSortKey(event.target.value)} className="bg-slate-900 px-4 py-3 text-white ring-1 ring-white/10">
          <option value="rank">Sort by rank</option>
          <option value="points">Sort by points</option>
          <option value="form">Sort by form</option>
          <option value="hold">Sort by hold rate</option>
          <option value="breakRate">Sort by break rate</option>
          <option value="clay">Sort by clay</option>
          <option value="hard">Sort by hard</option>
          <option value="grass">Sort by grass</option>
        </select>
      </div>

      <div className="mt-8 overflow-hidden border border-white/10">
        <div className="hidden grid-cols-[1.2fr_0.5fr_0.7fr_repeat(6,0.7fr)] gap-3 bg-slate-900 px-5 py-3 text-xs font-bold uppercase text-slate-500 md:grid">
          <span>Player</span><span>Rank</span><span>Points</span><span>Form</span><span>Hold</span><span>Break</span><span>Clay</span><span>Hard</span><span>Grass</span>
        </div>
        {filteredPlayers.map((player) => (
          <div key={player.id || player.name} className="grid gap-4 border-t border-white/10 bg-white/[0.03] px-5 py-5 md:grid-cols-[1.2fr_0.5fr_0.7fr_repeat(6,0.7fr)] md:items-center">
            <div>
              <p className="font-bold">{player.name}</p>
              <p className="text-sm text-slate-500">{player.country || activeTour} movement {player.movement || player.trend}</p>
            </div>
            <p className="text-sm text-slate-300">#{player.rank}</p>
            <p className="text-sm text-slate-300">{player.points || 0}</p>
            {[player.form, player.hold, player.breakRate, player.clay, player.hard, player.grass].map((value, index) => (
              <div key={`${player.id || player.name}-${index}`}>
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

function NewsPage({ news }) {
  const [category, setCategory] = useState("All");

  const filteredNews = useMemo(() => news.filter((item) => category === "All" || item.category === category), [news, category]);

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

      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {filteredNews.map((item) => (
          <article key={item.id || item.title} className="overflow-hidden border border-white/10 bg-white/[0.04] hover:border-lime-400/40">
            <NewsImage item={item} />
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between gap-3 text-sm">
                <span className="rounded-full bg-lime-400/10 px-3 py-1 font-bold text-lime-300">{item.category}</span>
                <span className="text-slate-500">{item.time}</span>
              </div>
              <h2 className="text-xl font-black leading-tight">{item.title}</h2>
              <p className="mt-4 leading-7 text-slate-400">{item.summary}</p>
              {item.url && item.url !== "#" && (
                <a href={item.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex font-bold text-lime-300 hover:text-lime-200">
                  Read from {item.source}
                </a>
              )}
            </div>
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
  const [liveData, setLiveData] = useState(initialLiveData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadLiveData() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/live-data?ts=${Date.now()}`);
      if (!response.ok) throw new Error(`Live data returned ${response.status}`);
      const payload = await response.json();

      setLiveData({
        generatedAt: payload.generatedAt || null,
        source: payload.source || initialLiveData.source,
        betUrl: payload.betUrl || defaultBetUrl,
        matches: Array.isArray(payload.matches) ? payload.matches : fallbackMatches,
        players: payload.players?.length ? payload.players : fallbackPlayers,
        news: payload.news?.length ? payload.news : fallbackNews,
        errors: payload.errors || [],
      });

      if (payload.errors?.length) setError("Some live feeds used fallback data.");
    } catch (loadError) {
      setLiveData(initialLiveData);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLiveData();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header activePage={activePage} setActivePage={setActivePage} />
      <DataStatus liveData={liveData} loading={loading} error={error} onRefresh={loadLiveData} />
      <main>
        {activePage === "home" && <HomePage setActivePage={setActivePage} liveData={liveData} />}
        {activePage === "predictions" && <PredictionsPage matches={liveData.matches} betUrl={liveData.betUrl} />}
        {activePage === "stats" && <StatsPage players={liveData.players} />}
        {activePage === "news" && <NewsPage news={liveData.news} />}
      </main>
      <ResponsibleFooter />
    </div>
  );
}
