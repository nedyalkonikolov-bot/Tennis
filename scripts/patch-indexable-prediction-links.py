from pathlib import Path

path = Path("src/App.jsx")
text = path.read_text()

old = '<div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-sm text-slate-400">{match.tournament} - {match.startTime}</p><h2 className="mt-2 text-2xl font-black">{match.playerA} vs {match.playerB}</h2></div><span className="rounded-full bg-lime-400/10 px-3 py-1 text-sm font-bold text-lime-300">{match.prediction.confidence}%</span></div>'
new = '<div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-sm text-slate-400">{match.tournament} - {match.startTime}</p><h2 className="mt-2 text-2xl font-black"><a href={`/predictions/${match.slug}/`} onClick={(event) => { event.preventDefault(); onNavigate(`/predictions/${match.slug}/`); }} className="hover:text-lime-300">{match.playerA} vs {match.playerB}</a></h2></div><span className="rounded-full bg-lime-400/10 px-3 py-1 text-sm font-bold text-lime-300">{match.prediction.confidence}%</span></div>'
text = text.replace(old, new)

old = '<div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${match.live ? "bg-red-500/15 text-red-200" : "bg-sky-400/10 text-sky-200"}`}>{match.live ? "Live" : "Upcoming"}</span><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">Anticipation {Math.round(match.anticipation)}</span><button type="button" onClick={() => onNavigate(`/predictions/${match.slug}/`)} className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-lime-300 hover:bg-white/10">Match page</button></div>'
new = '<div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${match.live ? "bg-red-500/15 text-red-200" : "bg-sky-400/10 text-sky-200"}`}>{match.live ? "Live" : "Upcoming"}</span><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">Anticipation {Math.round(match.anticipation)}</span><a href={`/predictions/${match.slug}/`} onClick={(event) => { event.preventDefault(); onNavigate(`/predictions/${match.slug}/`); }} className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-lime-300 hover:bg-white/10">Match page</a></div>'
text = text.replace(old, new)

old = 'return <div className="mt-10 border border-white/10 bg-white/[0.04] p-6"><h2 className="text-2xl font-black">Indexable Match Prediction Pages</h2><div className="mt-5 grid gap-3 md:grid-cols-2">{matchPages.slice(0, 24).map((match) => <button key={match.match_id} type="button" onClick={() => onNavigate(match.url)} className="bg-slate-900 p-4 text-left hover:bg-slate-800"><p className="font-bold">{match.title}</p><p className="mt-1 text-sm text-slate-500">{match.tour} - {match.tournament || "Tennis"}</p></button>)}</div></div>;'
new = 'return <div className="mt-10 border border-white/10 bg-white/[0.04] p-6"><h2 className="text-2xl font-black">Indexable Match Prediction Pages</h2><div className="mt-5 grid gap-3 md:grid-cols-2">{matchPages.slice(0, 24).map((match) => <a key={match.match_id} href={match.url} onClick={(event) => { event.preventDefault(); onNavigate(match.url); }} className="bg-slate-900 p-4 text-left hover:bg-slate-800"><p className="font-bold">{match.title}</p><p className="mt-1 text-sm text-slate-500">{match.tour} - {match.tournament || "Tennis"}</p></a>)}</div></div>;'
text = text.replace(old, new)

path.write_text(text)
