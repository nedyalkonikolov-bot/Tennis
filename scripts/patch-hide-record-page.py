from pathlib import Path

path = Path("src/App.jsx")
text = path.read_text()

text = text.replace('  CheckCircle2,\n', '')
text = text.replace('  { id: "record", label: "Record", path: "/prediction-record/", icon: CheckCircle2 },\n', '')
text = text.replace('  record: {\n    title: "TennisTipz Prediction Record | Tennis Betting Accuracy Tracker",\n    description: "Track TennisTipz prediction results, settled picks, ATP and WTA accuracy, surface performance, and recent match outcomes.",\n    canonical: "/prediction-record/",\n  },\n', '')
text = text.replace('            <button type="button" onClick={() => onNavigate("/prediction-record/")} className="rounded-xl border border-lime-400/40 px-6 py-4 font-bold text-lime-200 hover:bg-lime-400/10">Prediction Record</button>\n', '')
text = text.replace('      const [liveResponse, summaryResponse, recordResponse, matchPagesResponse, atpPlayersResponse, wtaPlayersResponse] = await Promise.allSettled([\n        fetch(`/api/live-data?ts=${Date.now()}`),\n        fetch("/api/db/summary"),\n        fetch("/api/db/record"),\n        fetch("/api/db/match-pages?limit=100"),\n        fetch("/api/db/player-pages?tour=ATP&limit=500"),\n        fetch("/api/db/player-pages?tour=WTA&limit=500"),\n      ]);', '      const [liveResponse, summaryResponse, matchPagesResponse, atpPlayersResponse, wtaPlayersResponse] = await Promise.allSettled([\n        fetch(`/api/live-data?ts=${Date.now()}`),\n        fetch("/api/db/summary"),\n        fetch("/api/db/match-pages?limit=100"),\n        fetch("/api/db/player-pages?tour=ATP&limit=500"),\n        fetch("/api/db/player-pages?tour=WTA&limit=500"),\n      ]);')
text = text.replace('      if (recordResponse.status === "fulfilled" && recordResponse.value.ok) { const payload = await recordResponse.value.json(); nextDbData.record = payload; nextDbData.recentResults = payload.recent || []; }\n', '')
text = text.replace('{route.id === "record" && <RecordPage dbData={dbData} />}', '')

path.write_text(text)
