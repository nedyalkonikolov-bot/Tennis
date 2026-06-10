import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ExternalLink,
  Gauge,
  Home,
  Landmark,
  Newspaper,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { fallbackNews, fallbackPlayers } from "./data/fallbackData";

const siteUrl = "https://www.tennistipz.win";
const defaultBetUrl = "https://www.cloudbet.com/en/sports/tennis";
const cloudbetUrl = "https://cldbt.cloud/go/en/landing/bitcoin-betting?af_token=ecea0a0896472c99ee3ff23d7fae8483&aftm_campaign=Tennis&aftm_source=tennistipz.win&aftm_medium=organic&aftm_content=Predictions&aftm_cid=4";
const bcGameUrl = "https://bc.game/i-9767ib363b-n/";
const stakeUrl = "https://stake.com/?c=NOYIoKcY";
const minPublicPickOdds = 1.01;
const maxPublicPickOdds = 2;
const minPublicPickConfidence = 70;

const navPages = [
  { id: "home", label: "Home", path: "/", icon: Home },
  { id: "predictions", label: "Predictions", path: "/tennis-predictions/", icon: Target },
  { id: "tips", label: "Betting Tips", path: "/tennis-betting-tips/", icon: Gauge },
  { id: "stats", label: "Player Stats", path: "/player-stats/", icon: Users },
  { id: "news", label: "News", path: "/tennis-news/", icon: Newspaper },
  { id: "betting", label: "Betting Sites", path: "/betting-sites/", icon: Landmark },
];

const pageMeta = {
  home: {
    title: "AI Tennis Predictions, Stats & News | TennisTipz",
    description: "TennisTipz gives bettors a fast homepage for AI tennis predictions, ATP and WTA stats, tennis news, upcoming tournaments, betting analysis and crypto tennis betting hubs.",
    canonical: "/",
  },
  predictions: {
    title: "Tennis Predictions Today | Cloudbet Odds & Crypto Tennis Betting Tips",
    description: "Daily ATP and WTA tennis predictions with Cloudbet odds, player form, ranking signals, surface ratings, and crypto betting context.",
    canonical: "/tennis-predictions/",
  },
  stats: {
    title: "ATP & WTA Player Stats | Tennis Betting Form, Rankings & Surfaces",
    description: "Research ATP and WTA player stats, rankings, points, form ratings, serve hold, return pressure, and clay, hard, and grass signals.",
    canonical: "/player-stats/",
  },
  news: {
    title: "Tennis News for Betting | ATP, WTA & Market Updates",
    description: "Latest tennis news for betting research, including ATP and WTA player updates, tournament context, market angles, and injury signals.",
    canonical: "/tennis-news/",
  },
  betting: {
    title: "Best Tennis Betting Sites | Cloudbet, BC.Game, Stake.com Reviews",
    description: "Compare crypto tennis betting sites including Cloudbet, BC.Game, and Stake.com with referral links, tennis market notes, and responsible betting guidance.",
    canonical: "/betting-sites/",
  },
  tips: {
    title: "Tennis Betting Tips Today | ATP & WTA Prediction Research",
    description: "Tennis betting tips for ATP and WTA matches with odds, AI confidence, player form, rankings, surface context, and responsible betting research.",
    canonical: "/tennis-betting-tips/",
  },
};

const bettingPageMeta = {
  "/betting-sites/": pageMeta.betting,
  "/tennis-betting/": {
    title: "Tennis Betting Guide | ATP, WTA, Odds & Prediction Research",
    description: "A practical tennis betting guide for ATP and WTA markets, Cloudbet odds, crypto sportsbooks, player stats, live betting, and responsible prediction research.",
    canonical: "/tennis-betting/",
  },
  "/tennis-betting-tips/": pageMeta.tips,
  "/cloudbet-tennis-betting/": {
    title: "Cloudbet Tennis Betting | ATP & WTA Odds and Predictions",
    description: "Cloudbet tennis betting research with ATP and WTA predictions, crypto odds context, player stats, AI confidence, and responsible betting notes.",
    canonical: "/cloudbet-tennis-betting/",
  },
  "/crypto-tennis-betting/": {
    title: "Crypto Tennis Betting Guide | Tennis Tips, Odds & Predictions",
    description: "Crypto tennis betting guide with responsible betting tips, Cloudbet odds context, tennis predictions, ATP/WTA stats, and news signals for market research.",
    canonical: "/crypto-tennis-betting/",
  },
};

const surfaces = ["All", "Hard", "Clay", "Grass"];
const tours = ["ATP", "WTA"];
const matchCategories = [
  { id: "live", label: "Live" },
  { id: "upcoming", label: "Upcoming" },
];
const newsCategories = ["All", "Setup", "News", "Tournament", "Player News", "Market", "Trend"];

const initialLiveData = {
  generatedAt: null,
  source: { tennis: "fallback", odds: "fallback", news: "fallback" },
  betUrl: cloudbetUrl,
  matches: [],
  players: fallbackPlayers,
  news: fallbackNews,
  errors: [],
};

const initialDbData = {
  summary: null,
  record: null,
  recentResults: [],
  matchPages: [],
  playerPages: [],
};

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function isoDateOrUndefined(value) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizePlayer(player) {
  const recentMatches = Number(player.recent_matches ?? player.stored_matches ?? 0);
  const recentWins = Number(player.recent_wins ?? player.stored_wins ?? 0);
  const recentLosses = Number(player.recent_losses ?? Math.max(recentMatches - recentWins, 0));
  const recentWinRate = player.recent_win_rate === null || player.recent_win_rate === undefined ? null : Number(player.recent_win_rate);
  return {
    id: player.id || player.player_key || player.name,
    name: player.name,
    tour: player.tour || player.sex || "ATP",
    country: player.country || "World",
    rank: Number(player.rank ?? player.current_rank ?? 999999),
    points: Number(player.points || 0),
    movement: player.movement || player.trend || "same",
    birthday: player.player_bday || "",
    photo: player.player_logo || "",
    recentMatches,
    recentWins,
    recentLosses,
    recentWinRate,
    form: recentWinRate ?? Number(player.form ?? player.form_rating ?? 0),
    season: player.season || "2026",
    seasonWins: Number(player.matches_won || 0),
    seasonLosses: Number(player.matches_lost || 0),
    titles: Number(player.titles || 0),
    surfaces: {
      hard: { wins: Number(player.hard_won || 0), losses: Number(player.hard_lost || 0) },
      clay: { wins: Number(player.clay_won || 0), losses: Number(player.clay_lost || 0) },
      grass: { wins: Number(player.grass_won || 0), losses: Number(player.grass_lost || 0) },
    },
    predictionMentions: Number(player.prediction_mentions || 0),
    updatedAt: player.updated_at || "",
    url: player.url || `/players/${String(player.tour || player.sex || "ATP").toLowerCase()}/${slugify(player.name)}/`,
    slug: player.slug || slugify(player.name),
  };
}

function getRoute(pathname) {
  const cleanPath = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const matchDetail = cleanPath.match(/^\/predictions\/([^/]+)\/$/);
  if (matchDetail) return { id: "match-detail", slug: matchDetail[1] };
  const playerDetail = cleanPath.match(/^\/players\/(atp|wta)\/([^/]+)\/$/i);
  if (playerDetail) return { id: "player-detail", tour: playerDetail[1].toUpperCase(), slug: playerDetail[2] };
  if (cleanPath === "/tennis-predictions-today/") return { id: "predictions", mode: "today" };
  if (cleanPath === "/atp-predictions/") return { id: "predictions", tour: "ATP" };
  if (cleanPath === "/wta-predictions/") return { id: "predictions", tour: "WTA" };
  if (cleanPath === "/players/atp/") return { id: "stats", tour: "ATP" };
  if (cleanPath === "/players/wta/") return { id: "stats", tour: "WTA" };
  if (cleanPath === "/tennis-betting-tips/") return { id: "tips", path: cleanPath };
  if (["/tennis-betting/", "/crypto-tennis-betting/", "/cloudbet-tennis-betting/", "/best-tennis-betting-sites/", "/betting-sites/"].includes(cleanPath)) return { id: "betting", path: cleanPath };
  const page = navPages.find((item) => item.path === cleanPath);
  return { id: page?.id || "home" };
}

function getInitialRoute() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("app") === "predictions") return { id: "predictions" };
  return getRoute(window.location.pathname);
}

function setMetaTag(selector, attribute, content) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    const value = selector.match(/\[(?:name|property)="(.+?)"\]/)?.[1];
    if (value) element.setAttribute(attribute, value);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function buildDynamicMeta(route, dbData) {
  if (route.id === "match-detail") {
    const match = dbData.matchPages.find((item) => item.slug === route.slug);
    if (match) {
      return {
        title: `${match.title} Prediction, Odds & Betting Tips | TennisTipz`,
        description: `${match.tour} ${match.title} prediction with odds, confidence, surface context, and betting analysis for ${match.tournament || "today's tennis"}.`,
        canonical: match.url,
      };
    }
  }
  if (route.id === "player-detail") {
    const player = dbData.playerPages.map(normalizePlayer).find((item) => item.tour === route.tour && item.slug === route.slug);
    if (player) {
      return {
        title: `${player.name} Predictions, Stats, Form & Tennis News | TennisTipz`,
        description: `${player.name} ${player.tour} player profile with predictions, ranking, 2026 season record, 100-day form, surface stats, upcoming matches and TennisTipz news context.`,
        canonical: player.url,
      };
    }
  }
  if (route.id === "predictions" && route.tour) {
    return {
      title: `${route.tour} Tennis Predictions Today | Betting Tips & Cloudbet Odds`,
      description: `${route.tour} tennis predictions with Cloudbet odds, form data, rankings, player stats, and crypto tennis betting tips.`,
      canonical: `/${route.tour.toLowerCase()}-predictions/`,
    };
  }
  if (route.id === "predictions" && route.mode === "today") {
    return {
      title: "Tennis Predictions Today | ATP & WTA Betting Tips",
      description: "Today's tennis predictions for ATP and WTA matches with Cloudbet odds, confidence, player form, and surface signals.",
      canonical: "/tennis-predictions-today/",
    };
  }
  if (route.id === "betting" && route.path) {
    return bettingPageMeta[route.path] || pageMeta.betting;
  }
  if (route.id === "tips") {
    return pageMeta.tips;
  }
  return pageMeta[route.id] || pageMeta.home;
}

function updateDocumentSeo(route, dbData) {
  const meta = buildDynamicMeta(route, dbData);
  const canonicalUrl = `${siteUrl}${meta.canonical}`;
  const image = `${siteUrl}/og-image.png`;
  const ogType = ["match-detail", "player-detail", "news", "tips", "betting"].includes(route.id) ? "article" : "website";
  document.title = meta.title;
  setMetaTag('meta[name="description"]', "name", meta.description);
  setMetaTag('meta[name="robots"]', "name", "index, follow, max-image-preview:large");
  setMetaTag('meta[property="og:site_name"]', "property", "TennisTipz");
  setMetaTag('meta[property="og:type"]', "property", ogType);
  setMetaTag('meta[property="og:title"]', "property", meta.title);
  setMetaTag('meta[property="og:description"]', "property", meta.description);
  setMetaTag('meta[property="og:url"]', "property", canonicalUrl);
  setMetaTag('meta[property="og:image"]', "property", image);
  setMetaTag('meta[name="twitter:card"]', "name", "summary_large_image");
  setMetaTag('meta[name="twitter:title"]', "name", meta.title);
  setMetaTag('meta[name="twitter:description"]', "name", meta.description);
  setMetaTag('meta[name="twitter:image"]', "name", image);

  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", canonicalUrl);
}

function updateStructuredData(route, liveData, dbData) {
  let script = document.getElementById("tennistipz-dynamic-schema");
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "tennistipz-dynamic-schema";
    document.head.appendChild(script);
  }

  const graph = [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "TennisTipz",
      url: `${siteUrl}/`,
      logo: `${siteUrl}/favicon.svg`,
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      name: "TennisTipz",
      url: `${siteUrl}/`,
      publisher: { "@id": `${siteUrl}/#organization` },
      audience: { "@type": "PeopleAudience", requiredMinAge: 18 },
    },
  ];

  if (route.id === "match-detail") {
    const match = dbData.matchPages.find((item) => item.slug === route.slug);
    if (match) {
      graph.push({
        "@type": "SportsEvent",
        name: match.title,
        url: `${siteUrl}${match.url}`,
        sport: "Tennis",
        eventStatus: match.live ? "https://schema.org/EventInProgress" : "https://schema.org/EventScheduled",
        startDate: isoDateOrUndefined(match.start_time),
        location: { "@type": "Place", name: match.tournament || "Tennis tournament" },
        competitor: [
          { "@type": "SportsTeam", name: match.player_a_name },
          { "@type": "SportsTeam", name: match.player_b_name },
        ],
      });
    }
  }

  if (route.id === "player-detail") {
    const player = dbData.playerPages.map(normalizePlayer).find((item) => item.tour === route.tour && item.slug === route.slug);
    if (player) {
      graph.push({
        "@type": "Person",
        name: player.name,
        url: `${siteUrl}${player.url}`,
        nationality: player.country,
        jobTitle: "Professional tennis player",
        sport: "Tennis",
        image: player.photo || `${siteUrl}/og-image.png`,
      });
    }
  }

  if (route.id === "betting") {
    graph.push({
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "What are the best tennis betting sites on TennisTipz?", acceptedAnswer: { "@type": "Answer", text: "TennisTipz compares Cloudbet, BC.Game, and Stake.com for crypto tennis betting research and responsible betting." } },
        { "@type": "Question", name: "Does TennisTipz provide guaranteed picks?", acceptedAnswer: { "@type": "Answer", text: "No. TennisTipz predictions are analytical opinions based on available data and are not guaranteed betting results." } },
      ],
    });
  }

  if (route.id === "predictions") {
    graph.push(...liveData.matches.slice(0, 10).map((match) => ({
      "@type": "SportsEvent",
      name: `${match.playerA} vs ${match.playerB}`,
      sport: "Tennis",
      eventStatus: match.live ? "https://schema.org/EventInProgress" : "https://schema.org/EventScheduled",
      location: { "@type": "Place", name: match.tournament || "Tennis tournament" },
      competitor: [{ "@type": "SportsTeam", name: match.playerA }, { "@type": "SportsTeam", name: match.playerB }],
    })));
  }

  script.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

function getPrediction(match, modelRun = 0) {
  const baseConfidence = Number(match.confidence) || 55;
  const confidence = Math.max(51, Math.min(84, Math.round(baseConfidence + modelRun)));
  const pick = match.predictedWinner || match.predicted_winner_name || match.market || "Value watch";
  return { confidence, pick, value: confidence >= 70 ? "Strong" : confidence >= 63 ? "Positive" : "Lean" };
}

function getAnticipationScore(match) {
  const recentMatches = (Number(match.recentA?.matches) || 0) + (Number(match.recentB?.matches) || 0);
  const hasCloudbetOdds = match.oddsSource === "Cloudbet" && match.predictedWinnerOdds && match.predictedWinnerOdds !== "N/A";
  return (Number(match.confidence) || 0) + Math.min(recentMatches, 30) * 0.7 + (hasCloudbetOdds ? 15 : 0) + (match.live ? 8 : 0) + (["ATP", "WTA"].includes(match.tour) ? 4 : 0);
}

function pickOdds(match) {
  return Number(match.predictedWinnerOdds || match.predicted_odds || match.odds || 0);
}

function formatUpdatedAt(value) {
  if (!value) return "Using fallback data";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function StatBar({ value }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  return <div className="h-2 w-full rounded-full bg-slate-800"><div className="h-2 rounded-full bg-lime-400" style={{ width: `${safeValue}%` }} /></div>;
}

function Metric({ label, value, helper }) {
  return <div className="bg-slate-900 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p>{helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}</div>;
}

function NewsImage({ item }) {
  if (item.imageUrl) return <img src={item.imageUrl} alt="" width="640" height="360" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-48 w-full object-cover" />;
  return <div className="flex h-48 w-full items-center justify-center bg-slate-900"><Newspaper size={42} className="text-lime-300/70" /></div>;
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

function Header({ route, onNavigate }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <a href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }} className="flex w-fit items-center gap-3 text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-400 text-slate-950 shadow-lg shadow-lime-400/20"><Trophy size={22} /></span>
          <span><span className="block text-xl font-bold tracking-tight">TennisTipz</span><span className="block text-xs text-slate-400">crypto tennis betting tips</span></span>
        </a>
        <nav className="flex gap-2 overflow-x-auto pb-1 md:pb-0" aria-label="Main navigation">
          {navPages.map((page) => {
            const Icon = page.icon;
            const active = route.id === page.id;
            return <a key={page.id} href={page.path} onClick={(event) => { event.preventDefault(); onNavigate(page.path); }} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${active ? "bg-lime-400 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}><Icon size={16} />{page.label}</a>;
          })}
        </nav>
      </div>
    </header>
  );
}

function HomeSection({ eyebrow, title, text, href, onNavigate, children }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-10 md:px-6 md:py-12">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-lime-300">{eyebrow}</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">{title}</h2>
          {text && <p className="mt-3 max-w-3xl leading-7 text-slate-400">{text}</p>}
        </div>
        {href && <a href={href} onClick={(event) => { event.preventDefault(); onNavigate(href); }} className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white no-underline hover:bg-white/10">Open hub <ExternalLink size={15} /></a>}
      </div>
      {children}
    </section>
  );
}

function HomePage({ onNavigate, liveData, dbData }) {
  const publicMatches = useMemo(() => {
    const liveSource = liveData.matches
      .filter((match) => ["ATP", "WTA"].includes(match.tour))
      .filter((match) => {
        const odds = pickOdds(match);
        return odds >= minPublicPickOdds && odds <= maxPublicPickOdds && (Number(match.confidence) || 0) >= minPublicPickConfidence;
      })
      .map((match) => ({ ...match, prediction: getPrediction(match), anticipation: getAnticipationScore(match), slug: slugify(`${match.tour} ${match.playerA} vs ${match.playerB}`) }));
    const dbSource = dbData.matchPages.map((match) => ({
      ...match,
      playerA: match.player_a_name,
      playerB: match.player_b_name,
      predictedWinner: match.predicted_winner_name,
      predictedWinnerOdds: match.predicted_odds,
      confidence: match.confidence,
      startTime: match.start_time || match.match_date || "",
      live: Boolean(match.live),
      prediction: getPrediction(match),
      anticipation: Number(match.confidence) || 0,
      slug: match.slug,
      url: match.url,
    }));
    return (liveSource.length ? liveSource : dbSource)
      .filter((match) => match.playerA && match.playerB)
      .sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.anticipation - a.anticipation)
      .slice(0, 6);
  }, [liveData.matches, dbData.matchPages]);

  const trendingPlayers = useMemo(() => {
    const players = (dbData.playerPages.length ? dbData.playerPages : liveData.players).map(normalizePlayer);
    return players
      .filter((player) => ["ATP", "WTA"].includes(player.tour) && player.rank < 999999)
      .sort((a, b) => b.predictionMentions - a.predictionMentions || b.recentMatches - a.recentMatches || a.rank - b.rank)
      .slice(0, 8);
  }, [dbData.playerPages, liveData.players]);

  const latestNews = useMemo(() => liveData.news.slice(0, 6), [liveData.news]);
  const featuredAnalysis = useMemo(() => dbData.matchPages.slice(0, 4), [dbData.matchPages]);
  const upcomingTournaments = [
    { name: "Wimbledon", slug: "wimbledon", surface: "Grass", note: "Grand Slam grass-court hub" },
    { name: "US Open", slug: "us-open", surface: "Hard", note: "Grand Slam hard-court hub" },
    { name: "French Open", slug: "french-open", surface: "Clay", note: "Roland Garros clay-court hub" },
    { name: "Australian Open", slug: "australian-open", surface: "Hard", note: "Grand Slam hard-court hub" },
  ];
  const liveMatches = liveData.matches.filter((match) => match.live).length;
  const upcomingMatches = Math.max(liveData.matches.length - liveMatches, publicMatches.filter((match) => !match.live).length);

  return (
    <>
      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:grid-cols-[1.05fr_0.95fr] md:px-6 md:py-16">
        <div className="flex flex-col justify-center">
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-lime-400/30 bg-lime-400/10 px-4 py-2 text-sm text-lime-300"><TrendingUp size={16} /> ATP and WTA predictions updated from live data</div>
          <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight md:text-6xl">AI Tennis Predictions, Stats & News</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">Start with today's strongest tennis predictions, then research player form, tournament context, latest news and crypto betting guides from one fast TennisTipz homepage.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => onNavigate("/tennis-predictions/")} className="rounded-xl bg-lime-400 px-6 py-4 font-bold text-slate-950 shadow-xl shadow-lime-400/20 hover:bg-lime-300">Today's Predictions</button>
            <button type="button" onClick={() => onNavigate("/player-stats/")} className="rounded-xl border border-white/15 px-6 py-4 font-bold text-white hover:bg-white/10">Trending Players</button>
            <button type="button" onClick={() => onNavigate("/tennis-news/")} className="rounded-xl border border-white/15 px-6 py-4 font-bold text-white hover:bg-white/10">Latest News</button>
          </div>
          <p className="mt-4 text-xs text-slate-500">18+. Tips are opinions, not guaranteed outcomes. Bet responsibly.</p>
        </div>
        <div className="border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30">
          <div className="bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Database snapshot</p>
            <h2 className="mt-1 text-2xl font-bold">Today on TennisTipz</h2>
            <div className="mt-5 grid gap-3 text-center sm:grid-cols-2">
              <Metric label="Live matches" value={liveMatches} />
              <Metric label="Upcoming matches" value={upcomingMatches} />
              <Metric label="Stored players" value={dbData.summary?.counts?.players || liveData.players.length} />
              <Metric label="Stored predictions" value={dbData.summary?.counts?.predictions || 0} />
            </div>
            <div className="mt-5 bg-slate-800 p-5 text-sm leading-6 text-slate-400">Prediction pages, player pages, tournament hubs and betting guides are linked from the homepage to help users and search engines reach the important research pages quickly.</div>
          </div>
        </div>
      </section>
      <HomeSection eyebrow="Today's top predictions" title="Best tennis picks on the board" text="High-confidence ATP and WTA prediction pages with odds, player form and match context." href="/tennis-predictions/" onNavigate={onNavigate}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {publicMatches.map((match) => <a key={match.url || match.slug} href={match.url || `/predictions/${match.slug}/`} onClick={(event) => { event.preventDefault(); onNavigate(match.url || `/predictions/${match.slug}/`); }} className="border border-white/10 bg-white/[0.04] p-5 no-underline hover:border-lime-400/40"><div className="mb-4 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{match.tour} {match.live ? "Live" : "Upcoming"}</span><span className="rounded-full bg-lime-400/10 px-3 py-1 font-bold text-lime-300">{match.prediction.confidence}%</span></div><h3 className="text-xl font-black text-white">{match.playerA} vs {match.playerB}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{match.tournament || "Tennis"} {match.surface ? `- ${match.surface}` : ""}</p><p className="mt-4 text-sm text-slate-300">AI pick: <span className="font-bold text-white">{match.prediction.pick}</span></p></a>)}
          {!publicMatches.length && <div className="border border-white/10 bg-white/[0.04] p-6 text-slate-400 md:col-span-2 lg:col-span-3">No public prediction markets are available right now. The Cloudbet feed refreshes automatically when ATP and WTA matches open for betting.</div>}
        </div>
      </HomeSection>
      <HomeSection eyebrow="Trending players" title="ATP and WTA players to research" text="Fast links into player stats, recent form and related prediction pages." href="/player-stats/" onNavigate={onNavigate}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {trendingPlayers.map((player) => <a key={`${player.tour}-${player.slug}`} href={player.url} className="border border-white/10 bg-slate-900 p-4 no-underline hover:border-lime-400/40"><div className="flex items-center justify-between gap-3"><h3 className="font-bold text-white">{player.name}</h3><span className="rounded-full bg-white/5 px-2 py-1 text-xs text-slate-300">{player.tour}</span></div><p className="mt-2 text-sm text-slate-500">Rank #{player.rank} - {player.country}</p><p className="mt-3 text-sm text-slate-300">100d: {player.recentWins}-{player.recentLosses}{player.recentWinRate !== null ? ` (${player.recentWinRate}%)` : ""}</p></a>)}
        </div>
      </HomeSection>
      <HomeSection eyebrow="Latest tennis news" title="News that can move tennis markets" text="Current ATP and WTA headlines selected for betting research, injuries, form swings and tournament context." href="/tennis-news/" onNavigate={onNavigate}>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {latestNews.map((item) => <article key={item.id || item.title} className="overflow-hidden border border-white/10 bg-white/[0.04]"><NewsImage item={item} /><div className="p-5"><div className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-500"><span className="rounded-full bg-lime-400/10 px-3 py-1 font-bold text-lime-300">{item.category || "News"}</span><span>{item.time}</span></div><h3 className="text-lg font-black leading-tight">{item.title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{item.summary}</p>{item.url && item.url !== "#" && <a href={item.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-bold text-lime-300">Read source</a>}</div></article>)}
        </div>
      </HomeSection>
      <HomeSection eyebrow="Upcoming tournaments" title="Tournament hubs for the biggest events" text="Grand Slam hubs are built for schedule, surface, key players, news and predictions." href="/tennis-predictions/" onNavigate={onNavigate}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {upcomingTournaments.map((tournament) => <a key={tournament.slug} href={`/tournaments/${tournament.slug}/`} className="border border-white/10 bg-white/[0.04] p-5 no-underline hover:border-lime-400/40"><CalendarDays className="text-lime-300" size={22} /><h3 className="mt-4 text-xl font-black text-white">{tournament.name}</h3><p className="mt-2 text-sm text-slate-500">{tournament.surface}</p><p className="mt-3 text-sm leading-6 text-slate-400">{tournament.note}</p></a>)}
        </div>
      </HomeSection>
      <HomeSection eyebrow="Featured analysis" title="Deep match pages and betting guides" text="Indexable analysis pages connect predictions, players, tournaments and sportsbook research." href="/tennis-betting-tips/" onNavigate={onNavigate}>
        <div className="grid gap-4 md:grid-cols-2">
          {featuredAnalysis.map((match) => <a key={match.url || match.match_id} href={match.url} onClick={(event) => { event.preventDefault(); onNavigate(match.url); }} className="border border-white/10 bg-slate-900 p-5 no-underline hover:border-lime-400/40"><p className="text-xs font-bold uppercase text-lime-300">{match.tour} prediction analysis</p><h3 className="mt-2 text-xl font-black text-white">{match.title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{match.tournament || "Tennis"} - Pick: {match.predicted_winner_name || "Value watch"}</p></a>)}
          <a href="/cloudbet-tennis-betting/" className="border border-white/10 bg-slate-900 p-5 no-underline hover:border-lime-400/40"><p className="text-xs font-bold uppercase text-lime-300">Sportsbook guide</p><h3 className="mt-2 text-xl font-black text-white">Cloudbet Tennis Betting</h3><p className="mt-3 text-sm leading-6 text-slate-400">How TennisTipz uses Cloudbet odds alongside player form and prediction confidence.</p></a>
          <a href="/crypto-tennis-betting/" className="border border-white/10 bg-slate-900 p-5 no-underline hover:border-lime-400/40"><p className="text-xs font-bold uppercase text-lime-300">Crypto guide</p><h3 className="mt-2 text-xl font-black text-white">Crypto Tennis Betting</h3><p className="mt-3 text-sm leading-6 text-slate-400">A responsible guide for researching tennis markets with bitcoin-friendly betting sites.</p></a>
        </div>
      </HomeSection>
      <section className="mx-auto max-w-7xl px-5 py-10 md:px-6">
        <div className="grid gap-6 border border-white/10 bg-white/[0.04] p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase text-lime-300">Newsletter placeholder</p>
            <h2 className="mt-2 text-3xl font-black">Get the next TennisTipz update</h2>
            <p className="mt-3 max-w-2xl leading-7 text-slate-400">A lightweight signup block is ready for your email provider: daily AI predictions, player form alerts, tournament links and latest tennis news.</p>
          </div>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => event.preventDefault()}>
            <label className="sr-only" htmlFor="home-newsletter-email">Email address</label>
            <input id="home-newsletter-email" type="email" placeholder="Email address" className="min-h-12 bg-slate-950 px-4 text-white outline-none ring-1 ring-white/15 placeholder:text-slate-500 focus:ring-lime-300" />
            <button type="submit" className="min-h-12 rounded-xl bg-lime-400 px-5 font-bold text-slate-950 hover:bg-lime-300">Notify me</button>
          </form>
        </div>
      </section>
      <SeoHubLinks onNavigate={onNavigate} />
    </>
  );
}

function SeoHubLinks({ onNavigate }) {
  const links = [
    ["/tennis-predictions-today/", "Tennis Predictions Today", "Daily ATP and WTA picks with odds and form signals."],
    ["/atp-predictions/", "ATP Predictions", "Men's tennis betting tips and Cloudbet markets."],
    ["/wta-predictions/", "WTA Predictions", "Women's tennis predictions, rankings and form notes."],
    ["/tennis-betting-tips/", "Tennis Betting Tips", "Daily betting checklist for odds, form and match context."],
    ["/cloudbet-tennis-betting/", "Cloudbet Tennis Betting", "Cloudbet odds explained with ATP and WTA prediction research."],
    ["/tennis-betting/", "Tennis Betting Guide", "A practical guide to researching tennis bets responsibly."],
    ["/crypto-tennis-betting/", "Crypto Tennis Betting", "Bitcoin-friendly tennis betting guide and site comparison."],
    ["/players/atp/", "ATP Player Profiles", "Top ATP player stats and betting research pages."],
    ["/players/wta/", "WTA Player Profiles", "Top WTA player stats and betting research pages."],
  ];
  return <section className="mx-auto max-w-7xl px-5 py-10 md:px-6"><div className="mb-6"><p className="text-sm font-semibold uppercase text-lime-300">Important hubs</p><h2 className="mt-2 text-3xl font-black">Explore TennisTipz</h2></div><div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{links.map(([href, title, text]) => <a key={href} href={href} onClick={(event) => { event.preventDefault(); onNavigate(href); }} className="border border-white/10 bg-white/[0.04] p-6 text-left no-underline hover:border-lime-400/40"><h3 className="text-xl font-bold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{text}</p></a>)}</div></section>;
}

function OddsLink({ match, fallbackBetUrl }) {
  const href = match.betUrl || fallbackBetUrl || cloudbetUrl;
  return <a href={href} target="_blank" rel="noreferrer sponsored" className="group block bg-slate-900 p-4 ring-1 ring-lime-400/20 transition hover:bg-lime-400 hover:text-slate-950"><span className="flex items-center justify-between gap-3 text-xs text-slate-500 group-hover:text-slate-800">Cloudbet odds <ExternalLink size={14} /></span><span className="mt-1 block font-bold">{match.predictedWinnerOdds || match.predicted_odds || match.odds || "N/A"}</span><span className="mt-1 block text-xs text-slate-500 group-hover:text-slate-800">{match.oddsSource || "Cloudbet"}</span></a>;
}

function BcGameTopBanner() {
  return <a href={bcGameUrl} target="_blank" rel="noreferrer sponsored" aria-label="Open BC.Game sponsored offer" className="mb-8 block overflow-hidden rounded-lg border border-lime-300/20 bg-slate-900 shadow-2xl shadow-black/30 transition hover:-translate-y-0.5 hover:brightness-105"><img src="/ads/bc-game-banner-970x250.gif" alt="BC.Game crypto casino sponsored offer" width="970" height="250" loading="lazy" decoding="async" fetchPriority="low" className="mx-auto block h-auto w-full max-w-[970px]" /></a>;
}

function PredictionsPage({ route, matches, dbData, betUrl, onNavigate }) {
  const [surface, setSurface] = useState("All");
  const [category, setCategory] = useState("upcoming");
  const [modelRun, setModelRun] = useState(0);
  const scopedMatches = useMemo(() => matches.filter((match) => {
    const price = pickOdds(match);
    return (!route.tour || match.tour === route.tour)
      && price >= minPublicPickOdds
      && price <= maxPublicPickOdds
      && (match.confidence || 0) >= minPublicPickConfidence
      && !match.doubles;
  }), [matches, route.tour]);
  const categoryCounts = useMemo(() => ({ live: scopedMatches.filter((match) => match.live).length, upcoming: scopedMatches.filter((match) => !match.live).length }), [scopedMatches]);
  const effectiveCategory = categoryCounts[category] ? category : categoryCounts.upcoming ? "upcoming" : "live";
  const filteredMatches = useMemo(() => scopedMatches
    .filter((match) => (effectiveCategory === "live" ? match.live : !match.live))
    .filter((match) => surface === "All" || match.surface === surface)
    .map((match) => ({ ...match, prediction: getPrediction(match, modelRun), anticipation: getAnticipationScore(match), slug: slugify(`${match.tour} ${match.playerA} vs ${match.playerB}`) }))
    .sort((a, b) => b.anticipation - a.anticipation || b.prediction.confidence - a.prediction.confidence), [scopedMatches, effectiveCategory, surface, modelRun]);
  const heading = route.tour ? `${route.tour} Tennis Predictions` : route.mode === "today" ? "Tennis Predictions Today" : "Tennis Betting Predictions";

  return (
    <section className="mx-auto max-w-7xl px-5 py-12 md:px-6">
      <BcGameTopBanner />
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div><p className="text-sm font-semibold uppercase text-lime-300">Cloudbet ATP/WTA value markets</p><h1 className="mt-2 text-4xl font-black">{heading}</h1><p className="mt-3 max-w-2xl text-slate-400">Live and upcoming tennis betting matches are separated, with a higher-risk value model showing only picks priced above 1.40 and ranking them by odds, form, status and confidence.</p></div>
        <button type="button" onClick={() => setModelRun((value) => (value === 3 ? -2 : value + 1))} className="inline-flex w-fit items-center gap-2 rounded-xl bg-lime-400 px-5 py-3 font-bold text-slate-950 hover:bg-lime-300"><Gauge size={18} /> Re-run Model</button>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">{matchCategories.map((item) => <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`rounded-xl px-5 py-2 text-sm font-bold ${effectiveCategory === item.id ? "bg-lime-400 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>{item.label} ({categoryCounts[item.id] || 0})</button>)}</div>
      <div className="mt-5 flex gap-2 overflow-x-auto">{surfaces.map((item) => <button key={item} type="button" onClick={() => setSurface(item)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${surface === item ? "bg-white text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>{item}</button>)}</div>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {filteredMatches.map((match) => <article key={match.id} className="border border-white/10 bg-white/[0.04] p-6">
          <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-sm text-slate-400">{match.tournament} - {match.startTime}</p><h2 className="mt-2 text-2xl font-black"><a href={`/predictions/${match.slug}/`} onClick={(event) => { event.preventDefault(); onNavigate(`/predictions/${match.slug}/`); }} className="hover:text-lime-300">{match.playerA} vs {match.playerB}</a></h2></div><span className="rounded-full bg-lime-400/10 px-3 py-1 text-sm font-bold text-lime-300">{match.prediction.confidence}%</span></div>
          <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${match.live ? "bg-red-500/15 text-red-200" : "bg-sky-400/10 text-sky-200"}`}>{match.live ? "Live" : "Upcoming"}</span><span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">Accuracy filter 70%+</span><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">Anticipation {Math.round(match.anticipation)}</span><a href={`/predictions/${match.slug}/`} onClick={(event) => { event.preventDefault(); onNavigate(`/predictions/${match.slug}/`); }} className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-lime-300 hover:bg-white/10">Match page</a></div>
          <p className="mt-5 text-slate-300">Predicted winner: <span className="font-bold text-white">{match.prediction.pick}</span></p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3"><OddsLink match={match} fallbackBetUrl={betUrl} /><Metric label={`${match.playerA} 100d`} value={`${match.recentA?.wins || 0}-${match.recentA?.losses || 0}`} helper={`${match.recentA?.winRate || 50}% win rate`} /><Metric label={`${match.playerB} 100d`} value={`${match.recentB?.wins || 0}-${match.recentB?.losses || 0}`} helper={`${match.recentB?.winRate || 50}% win rate`} /></div>
          <div className="mt-5 space-y-3 text-sm text-slate-300"><p>Surface: {match.surface} | Status: {match.live ? "Live" : match.status}</p><StatBar value={match.prediction.confidence} /></div>
        </article>)}
      </div>
      <MatchPageLinks matchPages={dbData.matchPages} onNavigate={onNavigate} />
      {!filteredMatches.length && <div className="mt-8 border border-white/10 bg-white/[0.04] p-8 text-slate-400">No Cloudbet ATP/WTA value picks above 1.40 found right now.</div>}
    </section>
  );
}

function MatchPageLinks({ matchPages, onNavigate }) {
  if (!matchPages.length) return null;
  return <div className="mt-10 border border-white/10 bg-white/[0.04] p-6"><h2 className="text-2xl font-black">Indexable Match Prediction Pages</h2><div className="mt-5 grid gap-3 md:grid-cols-2">{matchPages.slice(0, 24).map((match) => <a key={match.match_id} href={match.url} onClick={(event) => { event.preventDefault(); onNavigate(match.url); }} className="bg-slate-900 p-4 text-left hover:bg-slate-800"><p className="font-bold">{match.title}</p><p className="mt-1 text-sm text-slate-500">{match.tour} - {match.tournament || "Tennis"}</p></a>)}</div></div>;
}

function RecordPage({ dbData }) {
  const record = dbData.record?.record;
  const card = (label, value, helper) => <Metric label={label} value={value ?? "Pending"} helper={helper} />;
  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-6"><p className="text-sm font-semibold uppercase text-lime-300">Verified outcomes</p><h1 className="mt-2 text-4xl font-black">Prediction Record</h1><p className="mt-3 max-w-2xl text-slate-400">A public tracker for settled tennis predictions, accuracy by tour, recent performance, and surface splits. It will become stronger as daily syncs settle more matches.</p><div className="mt-8 grid gap-4 md:grid-cols-4">{card("Overall accuracy", record?.overall?.percent ? `${record.overall.percent}%` : "Pending", `${record?.overall?.settled || 0} settled`)}{card("ATP accuracy", record?.tours?.ATP?.percent ? `${record.tours.ATP.percent}%` : "Pending", `${record?.tours?.ATP?.settled || 0} settled`)}{card("WTA accuracy", record?.tours?.WTA?.percent ? `${record.tours.WTA.percent}%` : "Pending", `${record?.tours?.WTA?.settled || 0} settled`)}{card("Last 30 days", record?.last30?.percent ? `${record.last30.percent}%` : "Pending", `${record?.last30?.settled || 0} settled`)}</div><div className="mt-8 grid gap-5 md:grid-cols-3">{["clay", "hard", "grass"].map((surface) => <Metric key={surface} label={`${surface} accuracy`} value={record?.surfaces?.[surface]?.percent ? `${record.surfaces[surface].percent}%` : "Pending"} helper={`${record?.surfaces?.[surface]?.settled || 0} settled`} />)}</div><div className="mt-10 border border-white/10 bg-white/[0.04] p-6"><h2 className="text-2xl font-black">Recent Settled Predictions</h2>{!dbData.recentResults.length && <p className="mt-4 text-slate-400">No settled outcomes yet. The daily API-Tennis sync will start filling this once stored matches finish.</p>}{dbData.recentResults.map((item) => <div key={item.id} className="mt-4 border-t border-white/10 pt-4"><p className="font-bold">{item.player_a_name} vs {item.player_b_name}</p><p className="text-sm text-slate-400">Pick: {item.predicted_winner_name} | Winner: {item.actual_winner_name || "Pending"} | {item.correct ? "Correct" : "Miss"}</p></div>)}</div></section>;
}

function StatsPage({ route, livePlayers, dbData, onNavigate }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("rank");
  const [activeTour, setActiveTour] = useState(route.tour || "ATP");
  useEffect(() => { if (route.tour) setActiveTour(route.tour); }, [route.tour]);
  const sourcePlayers = dbData.playerPages.length ? dbData.playerPages : livePlayers;
  const filteredPlayers = useMemo(() => sourcePlayers.map(normalizePlayer).filter((player) => player.tour === activeTour).filter((player) => player.name.toLowerCase().includes(query.toLowerCase()) || player.country?.toLowerCase?.().includes(query.toLowerCase())).sort((a, b) => (sortKey === "rank" ? a.rank - b.rank : (b[sortKey] || 0) - (a[sortKey] || 0))), [sourcePlayers, activeTour, query, sortKey]);
  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-6"><p className="text-sm font-semibold uppercase text-lime-300">Player database</p><h1 className="mt-2 text-4xl font-black">ATP and WTA Player Stats</h1><p className="mt-3 max-w-2xl text-slate-400">Top 500 ATP and top 500 WTA players, split by tour with ranking points and verified 100-day singles form from API-Tennis fixtures.</p><div className="mt-8 flex gap-2 overflow-x-auto">{tours.map((tour) => <button key={tour} type="button" onClick={() => { setActiveTour(tour); onNavigate(`/players/${tour.toLowerCase()}/`); }} className={`rounded-xl px-5 py-2 text-sm font-bold ${activeTour === tour ? "bg-lime-400 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>{tour} Top 500</button>)}</div><div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]"><label className="flex items-center gap-3 bg-white/[0.04] px-4 py-3 ring-1 ring-white/10"><Search size={18} className="text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player or country" className="w-full bg-transparent text-white outline-none placeholder:text-slate-500" /></label><select value={sortKey} onChange={(event) => setSortKey(event.target.value)} className="bg-slate-900 px-4 py-3 text-white ring-1 ring-white/10"><option value="rank">Sort by rank</option><option value="points">Sort by points</option><option value="recentWinRate">Sort by 100d win rate</option><option value="recentMatches">Sort by 100d matches</option><option value="recentWins">Sort by 100d wins</option><option value="predictionMentions">Sort by predictions</option></select></div><div className="mt-8 overflow-hidden border border-white/10"><div className="hidden grid-cols-[1.25fr_0.45fr_0.65fr_0.65fr_0.65fr_0.65fr_0.65fr] gap-3 bg-slate-900 px-5 py-3 text-xs font-bold uppercase text-slate-500 md:grid"><span>Player</span><span>Rank</span><span>Points</span><span>100d W-L</span><span>Win rate</span><span>Matches</span><span>Predictions</span></div>{filteredPlayers.map((player) => <a key={player.id || player.name} href={player.url} className="grid w-full gap-4 border-t border-white/10 bg-white/[0.03] px-5 py-5 text-left no-underline hover:bg-white/[0.06] md:grid-cols-[1.25fr_0.45fr_0.65fr_0.65fr_0.65fr_0.65fr_0.65fr] md:items-center"><div><p className="font-bold text-white">{player.name}</p><p className="text-sm text-slate-500">{player.country} movement {player.movement}</p></div><p className="text-sm text-slate-300">#{player.rank}</p><p className="text-sm text-slate-300">{player.points}</p><p className="text-sm font-bold text-white">{player.recentWins}-{player.recentLosses}</p><div><p className="mb-2 text-sm font-bold text-white">{player.recentWinRate === null ? "N/A" : `${player.recentWinRate}%`}</p><StatBar value={player.recentWinRate || 0} /></div><p className="text-sm text-slate-300">{player.recentMatches}</p><p className="text-sm text-slate-300">{player.predictionMentions}</p></a>)}</div></section>;
}

function PlayerDetailPage({ route, dbData, onNavigate }) {
  const player = dbData.playerPages.map(normalizePlayer).find((item) => item.tour === route.tour && item.slug === route.slug);
  if (!player) return <NotFound title="Player profile loading" text="This player profile will appear after the database feed loads." />;
  const relatedPredictions = dbData.matchPages.filter((match) => match.player_a_name === player.name || match.player_b_name === player.name).slice(0, 8);
  const surfaceMetric = (name, data) => {
    const total = data.wins + data.losses;
    const rate = total ? `${Math.round((data.wins * 1000) / total) / 10}%` : "N/A";
    return <Metric label={`${name} surface`} value={`${data.wins}-${data.losses}`} helper={total ? `${rate} win rate` : "Not enough verified data"} />;
  };
  const opponentLink = (match) => {
    const opponent = match.player_a_name === player.name ? match.player_b_name : match.player_a_name;
    return opponent ? <a key={`${match.match_id || match.id}-${opponent}`} href={`/players/${player.tour.toLowerCase()}/${slugify(opponent)}/`} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white no-underline hover:bg-white/10">{opponent}</a> : null;
  };
  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-6"><button type="button" onClick={() => onNavigate(`/players/${player.tour.toLowerCase()}/`)} className="mb-6 text-sm font-bold text-lime-300">Back to {player.tour} players</button><div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-start"><div><p className="text-sm font-semibold uppercase text-lime-300">{player.tour} player profile</p><h1 className="mt-2 text-5xl font-black">{player.name} Predictions, Stats, Form & Tennis News</h1><p className="mt-3 max-w-3xl text-slate-400">{player.name} is tracked with ranking, points, 2026 season record, verified 100-day singles form, surface splits, prediction mentions, and internal research links. Missing sections update automatically when TennisTipz syncs fresh API-Tennis and prediction data.</p></div>{player.photo && <img src={player.photo} alt={`${player.name} tennis player`} className="h-40 w-40 border border-white/10 object-cover" />}</div><div className="mt-8 grid gap-4 md:grid-cols-4"><Metric label="Rank" value={player.rank >= 999999 ? "N/A" : `#${player.rank}`} helper={player.country} /><Metric label="Points" value={player.points} /><Metric label="100d W-L" value={`${player.recentWins}-${player.recentLosses}`} /><Metric label="100d win rate" value={player.recentWinRate === null ? "N/A" : `${player.recentWinRate}%`} helper={`${player.recentMatches} matches`} /></div><div className="mt-8 grid gap-5 md:grid-cols-4"><Metric label={`${player.season} season`} value={`${player.seasonWins}-${player.seasonLosses}`} helper={`${player.titles} titles stored`} />{surfaceMetric("Hard", player.surfaces.hard)}{surfaceMetric("Clay", player.surfaces.clay)}{surfaceMetric("Grass", player.surfaces.grass)}</div><div className="mt-8 grid gap-5 md:grid-cols-2"><div className="border border-white/10 bg-white/[0.04] p-6"><h2 className="text-2xl font-black">Latest Related Predictions</h2>{!relatedPredictions.length && <p className="mt-4 leading-7 text-slate-400">No indexed prediction page is attached to {player.name} yet. New Cloudbet ATP/WTA markets appear here when odds and model confidence pass public filters.</p>}{relatedPredictions.map((match) => <a key={match.match_id || match.url} href={match.url} className="mt-4 block w-full border-t border-white/10 pt-4 text-left no-underline hover:text-lime-300"><p className="font-bold">{match.title}</p><p className="text-sm text-slate-500">{match.tour} - {match.tournament || "Tennis"} - Pick: {match.predicted_winner_name || "Pending"}</p></a>)}</div><div className="border border-white/10 bg-white/[0.04] p-6"><h2 className="text-2xl font-black">Opponent and Tournament Links</h2><p className="mt-4 leading-7 text-slate-400">Jump into related player pages and prediction hubs for faster research around {player.name}'s market context.</p><div className="mt-5 flex flex-wrap gap-3">{relatedPredictions.map(opponentLink)}<button type="button" onClick={() => onNavigate(`/${player.tour.toLowerCase()}-predictions/`)} className="rounded-xl bg-lime-400 px-4 py-2 text-sm font-bold text-slate-950">{player.tour} predictions</button><button type="button" onClick={() => onNavigate("/tennis-news/")} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">Latest tennis news</button></div></div></div><div className="mt-8 border border-white/10 bg-white/[0.04] p-6"><h2 className="text-2xl font-black">Betting Research Notes</h2><p className="mt-4 leading-8 text-slate-400">Use {player.name}'s ranking, points, season record, 100-day form, surface splits, opponent profile, tournament context and current Cloudbet price before making any tennis betting decision. This page stays useful even while some fields are still syncing: unavailable values are shown clearly instead of being guessed.</p></div></section>;
}

function MatchDetailPage({ route, dbData, onNavigate }) {
  const match = dbData.matchPages.find((item) => item.slug === route.slug);
  if (!match) return <NotFound title="Match page loading" text="This match page will appear after the database feed loads." />;
  const reasons = Array.isArray(match.ai_reasons) ? match.ai_reasons : [];
  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-6"><button type="button" onClick={() => onNavigate("/tennis-predictions/")} className="mb-6 text-sm font-bold text-lime-300">Back to predictions</button><p className="text-sm font-semibold uppercase text-lime-300">{match.tour} AI prediction page</p><h1 className="mt-2 text-5xl font-black">{match.title} Prediction</h1><p className="mt-3 max-w-3xl text-slate-400">Cloudbet odds, AI prediction confidence, 100-day player form, 2026 season context, surface notes, and stored result tracking for {match.title}.</p><div className="mt-8 grid gap-4 md:grid-cols-4"><Metric label="AI pick" value={match.predicted_winner_name || "Value watch"} /><Metric label="Confidence" value={match.confidence ? `${match.confidence}%` : "Pending"} /><Metric label="Odds" value={match.predicted_odds || "N/A"} /><Metric label="Status" value={match.live ? "Live" : match.status || "Scheduled"} /></div><div className="mt-8 grid gap-5 md:grid-cols-3"><Metric label="Tournament" value={match.tournament || "Tennis"} /><Metric label="Surface" value={match.surface || "TBC"} /><Metric label="Result" value={match.result_status || "pending"} helper={match.actual_winner_name ? `Winner: ${match.actual_winner_name}` : "Outcome updates after settlement"} /></div><div className="mt-8 grid gap-5 md:grid-cols-2"><Metric label={`${match.player_a_name} 100d form`} value={`${match.player_a_recent_wins || 0}-${match.player_a_recent_losses || 0}`} helper={match.player_a_recent_win_rate === null || match.player_a_recent_win_rate === undefined ? "Not enough data" : `${match.player_a_recent_win_rate}% win rate`} /><Metric label={`${match.player_b_name} 100d form`} value={`${match.player_b_recent_wins || 0}-${match.player_b_recent_losses || 0}`} helper={match.player_b_recent_win_rate === null || match.player_b_recent_win_rate === undefined ? "Not enough data" : `${match.player_b_recent_win_rate}% win rate`} /><Metric label={`${match.player_a_name} 2026 season`} value={`${match.player_a_season_wins || 0}-${match.player_a_season_losses || 0}`} helper={match.player_a_rank ? `Rank #${match.player_a_rank}` : "Rank unavailable"} /><Metric label={`${match.player_b_name} 2026 season`} value={`${match.player_b_season_wins || 0}-${match.player_b_season_losses || 0}`} helper={match.player_b_rank ? `Rank #${match.player_b_rank}` : "Rank unavailable"} /></div><div className="mt-8 border border-white/10 bg-white/[0.04] p-6"><h2 className="text-2xl font-black">AI Prediction Analysis</h2><p className="mt-4 leading-8 text-slate-300">{match.ai_summary || "The TennisTipz AI model combines market-implied probability, ATP/WTA context, available form, surface ratings, ranking signals and live status."}</p>{reasons.length > 0 && <div className="mt-5 grid gap-3 md:grid-cols-2">{reasons.map((reason) => <div key={reason} className="bg-slate-900 p-4 text-sm leading-6 text-slate-300">{reason}</div>)}</div>}<p className="mt-5 leading-8 text-slate-400">{match.ai_betting_angle || "Use this prediction as research only; tennis betting has risk and no outcome is guaranteed."}</p><a href={cloudbetUrl} target="_blank" rel="noreferrer sponsored" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-lime-400 px-5 py-3 font-bold text-slate-950 hover:bg-lime-300">Open Cloudbet odds <ExternalLink size={16} /></a></div></section>;
}

function NewsPage({ news }) {
  const [category, setCategory] = useState("All");
  const filteredNews = useMemo(() => news.filter((item) => category === "All" || item.category === category).slice(0, 16), [news, category]);
  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-6"><div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-semibold uppercase text-lime-300">Live newsroom</p><h1 className="mt-2 text-4xl font-black">Tennis News for Betting</h1><p className="mt-3 max-w-2xl text-slate-400">Filter ATP and WTA updates by tournament context, player availability, market movement and trend signals.</p></div><CalendarDays className="text-slate-500" /></div><div className="mt-8 flex gap-2 overflow-x-auto">{newsCategories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${category === item ? "bg-white text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>{item}</button>)}</div><div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{filteredNews.map((item) => <article key={item.id || item.title} className="overflow-hidden border border-white/10 bg-white/[0.04] hover:border-lime-400/40"><NewsImage item={item} /><div className="p-6"><div className="mb-4 flex items-center justify-between gap-3 text-sm"><span className="rounded-full bg-lime-400/10 px-3 py-1 font-bold text-lime-300">{item.category}</span><span className="text-slate-500">{item.time}</span></div><h2 className="text-xl font-black leading-tight">{item.title}</h2><p className="mt-4 leading-7 text-slate-400">{item.summary}</p>{item.url && item.url !== "#" && <a href={item.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex font-bold text-lime-300 hover:text-lime-200">Read from {item.source}</a>}</div></article>)}</div></section>;
}

function TipsPage({ onNavigate }) {
  const tips = [
    ["Check the price first", "A good tennis prediction only matters if the available odds still leave room for value."],
    ["Compare player form", "Use 100-day form and 2026 season records to spot rhythm, fatigue, and sample-size risk."],
    ["Respect surface context", "Clay, grass, and hard courts can change serve value, rally length, and upset potential."],
    ["Wait for late news", "Player withdrawals, medical reports, scheduling, and market movement can change the edge quickly."],
  ];
  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-6"><p className="text-sm font-semibold uppercase text-lime-300">Tennis betting tips today</p><h1 className="mt-2 max-w-4xl text-5xl font-black">Betting tips built around odds, form, and match context</h1><p className="mt-4 max-w-3xl text-slate-400">Use these ATP and WTA betting tips as a research checklist before opening any sportsbook. TennisTipz combines odds, AI confidence, player stats, rankings, surface context and late news, but every pick still needs price discipline.</p><div className="mt-8 grid gap-5 md:grid-cols-2">{tips.map(([title, text]) => <article key={title} className="border border-white/10 bg-white/[0.04] p-6"><h2 className="text-2xl font-black">{title}</h2><p className="mt-4 leading-7 text-slate-400">{text}</p></article>)}</div><div className="mt-10 flex flex-wrap gap-3"><button type="button" onClick={() => onNavigate("/tennis-predictions/")} className="rounded-xl bg-lime-400 px-5 py-3 font-bold text-slate-950 hover:bg-lime-300">Open prediction board</button><button type="button" onClick={() => onNavigate("/player-stats/")} className="rounded-xl border border-white/15 px-5 py-3 font-bold text-white hover:bg-white/10">Compare player stats</button><a href="/cloudbet-tennis-betting/" className="rounded-xl border border-white/15 px-5 py-3 font-bold text-white no-underline hover:bg-white/10">Cloudbet guide</a></div></section>;
}

function BettingHubPage() {
  const sites = [{ name: "Cloudbet", url: cloudbetUrl, review: "/cloudbet-tennis-betting/", text: "Cloudbet is the main tennis odds source used on TennisTipz, with crypto-friendly betting markets and ATP/WTA odds that fit match prediction research." }, { name: "BC.Game", url: bcGameUrl, review: "/bc-game-tennis-betting/", text: "BC.Game is a crypto betting option for users comparing alternative sportsbooks and casino-led betting platforms with tennis market coverage." }, { name: "Stake.com", url: stakeUrl, review: "/stake-tennis-betting/", text: "Stake.com is a major crypto betting brand for bettors who want broad sports coverage, familiar markets, and a simple account experience." }];
  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-6"><p className="text-sm font-semibold uppercase text-lime-300">Crypto tennis betting</p><h1 className="mt-2 text-4xl font-black">Best Tennis Betting Sites</h1><p className="mt-3 max-w-3xl text-slate-400">Compare crypto-friendly tennis betting sites for ATP and WTA markets, odds research, and responsible tennis betting. These links may be sponsored.</p><div className="mt-8 grid gap-5 md:grid-cols-3">{sites.map((site) => <article key={site.name} className="border border-white/10 bg-white/[0.04] p-6"><div className="mb-5 flex h-28 items-center justify-center bg-slate-900 text-2xl font-black text-lime-300">{site.name}</div><h2 className="text-2xl font-black">{site.name}</h2><p className="mt-4 leading-7 text-slate-400">{site.text}</p><div className="mt-6 flex flex-wrap gap-3"><a href={site.url} target="_blank" rel="noreferrer sponsored" className="inline-flex items-center gap-2 rounded-xl bg-lime-400 px-5 py-3 font-bold text-slate-950 hover:bg-lime-300">Visit {site.name} <ExternalLink size={16} /></a><a href={site.review} className="inline-flex items-center rounded-xl border border-white/15 px-5 py-3 font-bold text-white no-underline hover:bg-white/10">Read review</a></div></article>)}</div><div className="mt-10 border border-white/10 bg-white/[0.04] p-6"><h2 className="text-2xl font-black">Crypto Tennis Betting Guide</h2><p className="mt-4 leading-8 text-slate-400">A strong tennis betting workflow starts with market availability, then compares odds against player form, ranking movement, surface ratings, recent match load and tournament context. TennisTipz uses Cloudbet odds with ATP and WTA data to help bettors research picks before placing any wager.</p><div className="mt-5 flex flex-wrap gap-3"><a href="/br/previsoes-tenis/" className="rounded-xl border border-white/15 px-4 py-2 font-bold text-white no-underline hover:bg-white/10">Brazil PT-BR</a><a href="/bd/tennis-predictions/" className="rounded-xl border border-white/15 px-4 py-2 font-bold text-white no-underline hover:bg-white/10">Bangladesh BN</a><a href="/tr/tenis-tahminleri/" className="rounded-xl border border-white/15 px-4 py-2 font-bold text-white no-underline hover:bg-white/10">Turkey TR</a></div></div></section>;
}

function NotFound({ title = "Page not found", text = "The page could not be loaded yet." }) {
  return <section className="mx-auto max-w-7xl px-5 py-20 md:px-6"><h1 className="text-4xl font-black">{title}</h1><p className="mt-4 text-slate-400">{text}</p></section>;
}

function ResponsibleFooter() {
  return <footer className="border-t border-white/10 px-5 py-8 text-sm text-slate-500 md:px-6"><div className="mx-auto max-w-7xl"><div className="mb-4 flex items-center gap-2 text-slate-300"><ShieldCheck size={18} /> Responsible Play</div><p className="max-w-4xl">18+ only. Tennis predictions are analytical opinions based on available information and are not guaranteed outcomes. Betting involves risk. Never bet more than you can afford to lose.</p></div></footer>;
}

export default function TennisTipzApp() {
  const [route, setRoute] = useState(getInitialRoute);
  const [liveData, setLiveData] = useState(initialLiveData);
  const [dbData, setDbData] = useState(initialDbData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function navigateTo(path) {
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setRoute(getRoute(path));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadPlayerPages() {
    const [atpPlayersResponse, wtaPlayersResponse] = await Promise.allSettled([
      fetch("/api/db/player-pages?tour=ATP&limit=500"),
      fetch("/api/db/player-pages?tour=WTA&limit=500"),
    ]);
    const players = [];
    if (atpPlayersResponse.status === "fulfilled" && atpPlayersResponse.value.ok) players.push(...((await atpPlayersResponse.value.json()).players || []));
    if (wtaPlayersResponse.status === "fulfilled" && wtaPlayersResponse.value.ok) players.push(...((await wtaPlayersResponse.value.json()).players || []));
    if (players.length) setDbData((current) => ({ ...current, playerPages: players }));
  }

  async function loadLiveData() {
    setLoading(true);
    setError("");
    try {
      const [liveResponse, summaryResponse, matchPagesResponse] = await Promise.allSettled([
        fetch("/api/live-data"),
        fetch("/api/db/summary"),
        fetch("/api/db/match-pages?limit=100"),
      ]);

      if (liveResponse.status === "fulfilled" && liveResponse.value.ok) {
        const payload = await liveResponse.value.json();
        const source = payload.source || initialLiveData.source;
        const hasLivePredictionFeed = source.tennis !== "fallback" && source.odds !== "fallback";
        setLiveData({ generatedAt: payload.generatedAt || null, source, betUrl: payload.betUrl || cloudbetUrl, matches: hasLivePredictionFeed && Array.isArray(payload.matches) ? payload.matches : [], players: payload.players?.length ? payload.players : fallbackPlayers, news: payload.news?.length ? payload.news : fallbackNews, errors: payload.errors || [] });
        if (payload.errors?.length) setError("Some live feeds used fallback data.");
      } else {
        setLiveData(initialLiveData);
        setError("Live prediction feed unavailable. No fallback picks are shown.");
      }

      const nextDbData = { ...initialDbData };
      if (summaryResponse.status === "fulfilled" && summaryResponse.value.ok) nextDbData.summary = await summaryResponse.value.json();
      if (matchPagesResponse.status === "fulfilled" && matchPagesResponse.value.ok) { const payload = await matchPagesResponse.value.json(); nextDbData.matchPages = payload.matches || []; }
      setDbData(nextDbData);
      if (["stats", "player-detail"].includes(route.id)) await loadPlayerPages();
    } catch (loadError) {
      setLiveData(initialLiveData);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLiveData(); }, []);
  useEffect(() => {
    if (["stats", "player-detail"].includes(route.id) && !dbData.playerPages.length) loadPlayerPages();
  }, [route.id, dbData.playerPages.length]);
  useEffect(() => { updateDocumentSeo(route, dbData); updateStructuredData(route, liveData, dbData); }, [route, liveData, dbData]);
  useEffect(() => { const onPopState = () => setRoute(getRoute(window.location.pathname)); window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState); }, []);

  return <div className="min-h-screen bg-slate-950 text-white"><Header route={route} onNavigate={navigateTo} /><DataStatus liveData={liveData} loading={loading} error={error} onRefresh={loadLiveData} /><main>{route.id === "home" && <HomePage onNavigate={navigateTo} liveData={liveData} dbData={dbData} />}{route.id === "predictions" && <PredictionsPage route={route} matches={liveData.matches} dbData={dbData} betUrl={liveData.betUrl} onNavigate={navigateTo} />}{route.id === "tips" && <TipsPage onNavigate={navigateTo} />}{route.id === "stats" && <StatsPage route={route} livePlayers={liveData.players} dbData={dbData} onNavigate={navigateTo} />}{route.id === "player-detail" && <PlayerDetailPage route={route} dbData={dbData} onNavigate={navigateTo} />}{route.id === "match-detail" && <MatchDetailPage route={route} dbData={dbData} onNavigate={navigateTo} />}{route.id === "news" && <NewsPage news={liveData.news} />}{route.id === "betting" && <BettingHubPage />}</main><ResponsibleFooter /></div>;
}
